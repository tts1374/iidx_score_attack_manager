import {
  PayloadValidationError,
  buildPublicTournamentRegistryHash,
  encodeTournamentPayload,
  normalizeTournamentPayload,
  sha256Text,
  type ErrorParams,
  type PublicCatalogApiErrorCode,
  type PublicCatalogApiErrorResponse,
  type PublicTournamentListResponse,
  type PublicTournamentPayloadResponse,
  type PublicTournamentRegisterResponse,
} from '@iidx/shared';
import {
  createCorsHeaders,
  createVaryHeaders,
  resolveCorsContext,
} from './cors.js';
import {
  parsePublicCatalogConfig,
  type PublicCatalogEnv,
} from './env.js';
import {
  decodePublicTournamentListCursor,
  encodePublicTournamentListCursor,
} from './pagination.js';
import {
  D1PublicTournamentRepository,
  type PublicTournamentAuditLogEntry,
  type PublicTournamentAuditResult,
  type PublicTournamentRecord,
  type PublicTournamentRepository,
} from './repository/public-tournaments.js';
import {
  buildRequestFingerprint,
  getRateLimitWindowStart,
} from './rate-limit.js';
import {
  LIST_PUBLIC_TOURNAMENTS_PATH,
  matchPublicTournamentItemPath,
  matchPublicTournamentPayloadPath,
} from './routes.js';

const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const PUBLIC_TOURNAMENTS_ROUTE_METHODS = ['GET', 'POST', 'OPTIONS'] as const;
const PUBLIC_TOURNAMENT_PAYLOAD_ROUTE_METHODS = ['GET', 'OPTIONS'] as const;
const PUBLIC_TOURNAMENT_ITEM_ROUTE_METHODS = ['DELETE', 'OPTIONS'] as const;
const PUBLIC_TOURNAMENTS_PAGE_SIZE = 20;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DELETE_REASON_LOCAL_TOURNAMENT_DELETED = 'local_tournament_deleted';

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicCatalogApiErrorCode,
    message: string,
    readonly details?: ErrorParams,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PublicCatalogWorkerDependencies {
  createRepository?: (db: D1Database) => PublicTournamentRepository;
  now?: () => Date;
  randomUUID?: () => string;
}

interface CreateOrResolveTournamentResult {
  created: boolean;
  record: PublicTournamentRecord;
}

function mergeHeaders(target: Headers, source: Headers): void {
  source.forEach((value, key) => {
    target.set(key, value);
  });
}

function buildJsonHeaders(
  allowedOrigin: string | null,
  allowedMethods: readonly string[] = PUBLIC_TOURNAMENTS_ROUTE_METHODS,
): Headers {
  const headers = createVaryHeaders();
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (allowedOrigin) {
    mergeHeaders(headers, createCorsHeaders(allowedOrigin, allowedMethods));
  }
  return headers;
}

function jsonResponse<T>(
  status: number,
  body: T,
  allowedOrigin: string | null,
  allowedMethods: readonly string[] = PUBLIC_TOURNAMENTS_ROUTE_METHODS,
  extraHeaders?: HeadersInit,
): Response {
  const headers = buildJsonHeaders(allowedOrigin, allowedMethods);
  if (extraHeaders) {
    mergeHeaders(headers, new Headers(extraHeaders));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  status: number,
  code: PublicCatalogApiErrorCode,
  message: string,
  allowedOrigin: string | null,
  details?: ErrorParams,
  allowedMethods: readonly string[] = PUBLIC_TOURNAMENTS_ROUTE_METHODS,
  extraHeaders?: HeadersInit,
): Response {
  const body: PublicCatalogApiErrorResponse = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  return jsonResponse(
    status,
    body,
    allowedOrigin,
    allowedMethods,
    extraHeaders,
  );
}

function createAuditEntry(
  result: PublicTournamentAuditResult,
  requestFingerprint: string,
  createdAt: string,
  origin: string | null,
  options: {
    publicId?: string | null;
    registryHash?: string | null;
    details?: Record<string, unknown>;
  } = {},
): PublicTournamentAuditLogEntry {
  return {
    publicId: options.publicId ?? null,
    registryHash: options.registryHash ?? null,
    result,
    requestFingerprint,
    origin,
    createdAt,
    ...(options.details ? { details: options.details } : {}),
  };
}

function normalizeBodyChunk(value: Uint8Array | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  return new Uint8Array(value);
}

async function readRequestTextWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const body = request.body;
  if (!body) {
    throw new ApiError(400, 'BAD_REQUEST', 'request body is required');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      const chunk = normalizeBodyChunk(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'request body too large');
      }

      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.join('') + decoder.decode();
}

function getMediaType(contentTypeHeader: string | null): string {
  return (contentTypeHeader ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const mediaType = getMediaType(request.headers.get('content-type'));
  if (mediaType !== 'application/json') {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'content-type must be application/json',
    );
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new ApiError(400, 'BAD_REQUEST', 'invalid content-length header');
    }
    if (parsedLength > MAX_REQUEST_BODY_BYTES) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'request body too large');
    }
  }

  const rawBody = await readRequestTextWithLimit(request, MAX_REQUEST_BODY_BYTES);
  if (rawBody.trim().length === 0) {
    throw new ApiError(400, 'BAD_REQUEST', 'request body is required');
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'request body must be valid json');
  }
}

function toPublicTournamentRecord(
  payload: ReturnType<typeof normalizeTournamentPayload>,
  registryHash: string,
  publicId: string,
  deleteTokenHash: string,
  createdAt: string,
): PublicTournamentRecord {
  const payloadJson = JSON.stringify(payload);

  return {
    publicId,
    registryHash,
    payloadJson,
    name: payload.name,
    owner: payload.owner,
    hashtag: payload.hashtag,
    startDate: payload.start,
    endDate: payload.end,
    chartCount: payload.charts.length,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    deleteReason: null,
    deleteTokenHash,
  };
}

async function createOrResolveTournament(
  repository: PublicTournamentRepository,
  record: PublicTournamentRecord,
): Promise<CreateOrResolveTournamentResult> {
  const created = await repository.create(record);
  if (created) {
    return { created: true, record };
  }

  const existing = await repository.getByRegistryHash(record.registryHash);
  if (!existing) {
    throw new Error('existing public tournament not found after duplicate insert');
  }

  return { created: false, record: existing };
}

function buildMethodNotAllowedResponse(
  allowedOrigin: string | null,
  allowedMethods: readonly string[],
): Response {
  return errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'method not allowed',
    allowedOrigin,
    undefined,
    allowedMethods,
    { Allow: allowedMethods.join(', ') },
  );
}

function buildOriginNotAllowedResponse(
  allowedMethods: readonly string[],
): Response {
  return errorResponse(
    403,
    'ORIGIN_NOT_ALLOWED',
    'origin not allowed',
    null,
    undefined,
    allowedMethods,
  );
}

function buildNotFoundResponse(
  allowedOrigin: string | null,
  allowedMethods: readonly string[],
): Response {
  return errorResponse(
    404,
    'NOT_FOUND',
    'public tournament not found',
    allowedOrigin,
    undefined,
    allowedMethods,
  );
}

function formatJstDate(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

async function handleListPublicTournaments(
  request: Request,
  repository: PublicTournamentRepository,
  allowedOrigin: string,
  currentTime: Date,
): Promise<Response> {
  const url = new URL(request.url);
  const rawCursor = url.searchParams.get('cursor');
  let cursor: { createdAt: string; publicId: string; startDateFrom?: string } | null = null;
  if (rawCursor !== null) {
    try {
      cursor = decodePublicTournamentListCursor(rawCursor);
    } catch {
      return errorResponse(
        400,
        'BAD_REQUEST',
        'cursor is invalid',
        allowedOrigin,
        undefined,
        PUBLIC_TOURNAMENTS_ROUTE_METHODS,
      );
    }
  }

  const searchQuery = url.searchParams.get('q')?.trim() ?? '';
  const currentStartDateFrom = formatJstDate(currentTime);
  const startDateFrom =
    cursor?.startDateFrom && cursor.startDateFrom > currentStartDateFrom
      ? cursor.startDateFrom
      : currentStartDateFrom;
  const result = await repository.listActive({
    searchQuery: searchQuery.length > 0 ? searchQuery : null,
    cursor,
    startDateFrom,
    limit: PUBLIC_TOURNAMENTS_PAGE_SIZE,
  });
  const lastItem = result.items.at(-1);
  const responseBody: PublicTournamentListResponse = {
    items: result.items,
    nextCursor:
      result.hasMore && lastItem
        ? encodePublicTournamentListCursor({
            createdAt: lastItem.createdAt,
            publicId: lastItem.publicId,
            startDateFrom,
          })
        : null,
  };

  return jsonResponse(
    200,
    responseBody,
    allowedOrigin,
    PUBLIC_TOURNAMENTS_ROUTE_METHODS,
  );
}

async function handlePublicTournamentPayload(
  publicId: string,
  repository: PublicTournamentRepository,
  allowedOrigin: string,
): Promise<Response> {
  const record = await repository.getActiveByPublicId(publicId);
  if (!record) {
    return buildNotFoundResponse(
      allowedOrigin,
      PUBLIC_TOURNAMENT_PAYLOAD_ROUTE_METHODS,
    );
  }

  try {
    const responseBody: PublicTournamentPayloadResponse = {
      payloadParam: encodeTournamentPayload(JSON.parse(record.payloadJson)),
    };

    return jsonResponse(
      200,
      responseBody,
      allowedOrigin,
      PUBLIC_TOURNAMENT_PAYLOAD_ROUTE_METHODS,
    );
  } catch (error) {
    console.error('public tournament payload encoding failed', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'failed to load tournament payload',
      allowedOrigin,
      undefined,
      PUBLIC_TOURNAMENT_PAYLOAD_ROUTE_METHODS,
    );
  }
}

async function handleDeletePublicTournament(
  publicId: string,
  request: Request,
  repository: PublicTournamentRepository,
  allowedOrigin: string,
  currentTime: Date,
): Promise<Response> {
  const deleteToken = request.headers.get('X-Public-Catalog-Delete-Token')?.trim() ?? '';
  if (!deleteToken) {
    return errorResponse(
      400,
      'BAD_REQUEST',
      'delete token is required',
      allowedOrigin,
      undefined,
      PUBLIC_TOURNAMENT_ITEM_ROUTE_METHODS,
    );
  }

  const deletedAt = currentTime.toISOString();
  const deleted = await repository.softDeleteByPublicId(
    publicId,
    sha256Text(deleteToken),
    deletedAt,
    DELETE_REASON_LOCAL_TOURNAMENT_DELETED,
  );
  if (!deleted) {
    return buildNotFoundResponse(
      allowedOrigin,
      PUBLIC_TOURNAMENT_ITEM_ROUTE_METHODS,
    );
  }

  return new Response(null, {
    status: 204,
    headers: buildJsonHeaders(
      allowedOrigin,
      PUBLIC_TOURNAMENT_ITEM_ROUTE_METHODS,
    ),
  });
}

export function createWorkerHandler(
  dependencies: PublicCatalogWorkerDependencies = {},
): ExportedHandler<PublicCatalogEnv> {
  const createRepository =
    dependencies.createRepository ??
    ((db: D1Database) => new D1PublicTournamentRepository(db));
  const now = dependencies.now ?? (() => new Date());
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const publicIdForPayload = matchPublicTournamentPayloadPath(url.pathname);
      const publicIdForItem = publicIdForPayload ? null : matchPublicTournamentItemPath(url.pathname);
      const isPublicTournamentCollectionPath =
        url.pathname === LIST_PUBLIC_TOURNAMENTS_PATH;
      if (!isPublicTournamentCollectionPath && !publicIdForPayload && !publicIdForItem) {
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 404, headers: createVaryHeaders() });
        }
        return errorResponse(404, 'NOT_FOUND', 'route not found', null);
      }

      let config;
      try {
        config = parsePublicCatalogConfig(env);
      } catch {
        return errorResponse(
          500,
          'INTERNAL_ERROR',
          'worker configuration is invalid',
          null,
        );
      }

      const cors = resolveCorsContext(
        request.headers.get('Origin'),
        config.allowedOrigins,
      );
      const routeMethods = publicIdForPayload
        ? PUBLIC_TOURNAMENT_PAYLOAD_ROUTE_METHODS
        : publicIdForItem
          ? PUBLIC_TOURNAMENT_ITEM_ROUTE_METHODS
        : PUBLIC_TOURNAMENTS_ROUTE_METHODS;

      if (request.method === 'OPTIONS') {
        if (!cors.allowedOrigin) {
          return new Response(null, { status: 403, headers: createVaryHeaders() });
        }
        return new Response(null, {
          status: 204,
          headers: createCorsHeaders(cors.allowedOrigin, routeMethods),
        });
      }

      if (publicIdForPayload) {
        if (request.method !== 'GET') {
          return buildMethodNotAllowedResponse(cors.allowedOrigin, routeMethods);
        }
        if (!cors.allowedOrigin) {
          return buildOriginNotAllowedResponse(routeMethods);
        }
        return handlePublicTournamentPayload(
          publicIdForPayload,
          createRepository(env.DB),
          cors.allowedOrigin,
        );
      }

      if (publicIdForItem) {
        if (request.method !== 'DELETE') {
          return buildMethodNotAllowedResponse(cors.allowedOrigin, routeMethods);
        }
        if (!cors.allowedOrigin) {
          return buildOriginNotAllowedResponse(routeMethods);
        }
        return handleDeletePublicTournament(
          publicIdForItem,
          request,
          createRepository(env.DB),
          cors.allowedOrigin,
          now(),
        );
      }

      if (request.method === 'GET') {
        if (!cors.allowedOrigin) {
          return buildOriginNotAllowedResponse(routeMethods);
        }
        return handleListPublicTournaments(
          request,
          createRepository(env.DB),
          cors.allowedOrigin,
          now(),
        );
      }

      if (request.method !== 'POST') {
        return buildMethodNotAllowedResponse(cors.allowedOrigin, routeMethods);
      }

      const repository = createRepository(env.DB);
      const currentTime = now();
      const createdAt = currentTime.toISOString();
      const requestFingerprint = buildRequestFingerprint(
        request,
        config.rateLimitSalt,
      );
      const auditOrigin = cors.requestOrigin ?? request.headers.get('Origin');
      const windowStart = getRateLimitWindowStart(
        currentTime,
        config.rateLimitWindowSeconds,
      );
      const recentAttempts = await repository.countRecentAttempts(
        requestFingerprint,
        windowStart,
      );

      if (recentAttempts >= config.rateLimitMaxRequests) {
        await repository.insertAuditLog(
          createAuditEntry('rate_limited', requestFingerprint, createdAt, auditOrigin),
        );
        return errorResponse(
          429,
          'RATE_LIMITED',
          'rate limit exceeded',
          cors.allowedOrigin,
          undefined,
          routeMethods,
        );
      }

      if (!cors.allowedOrigin) {
        await repository.insertAuditLog(
          createAuditEntry(
            'origin_rejected',
            requestFingerprint,
            createdAt,
            auditOrigin,
            {
              details: {
                origin: request.headers.get('Origin') ?? null,
              },
            },
          ),
        );
        return buildOriginNotAllowedResponse(routeMethods);
      }

      let requestPayload: unknown;
      try {
        requestPayload = await parseJsonBody(request);
      } catch (error) {
        if (error instanceof ApiError) {
          const auditResult: PublicTournamentAuditResult =
            error.code === 'INVALID_JSON'
              ? 'invalid_json'
              : error.code === 'PAYLOAD_TOO_LARGE'
                ? 'payload_too_large'
                : error.code === 'UNSUPPORTED_MEDIA_TYPE'
                  ? 'unsupported_media_type'
                  : 'bad_request';
          await repository.insertAuditLog(
            createAuditEntry(auditResult, requestFingerprint, createdAt, auditOrigin),
          );
          return errorResponse(
            error.status,
            error.code,
            error.message,
            cors.allowedOrigin,
            error.details,
            routeMethods,
          );
        }
        throw error;
      }

      let normalizedPayload: ReturnType<typeof normalizeTournamentPayload>;
      try {
        normalizedPayload = normalizeTournamentPayload(requestPayload);
      } catch (error) {
        if (error instanceof PayloadValidationError) {
          await repository.insertAuditLog(
            createAuditEntry(
              'invalid_payload',
              requestFingerprint,
              createdAt,
              auditOrigin,
              error.params ? { details: error.params } : {},
            ),
          );
          return errorResponse(
            400,
            'INVALID_PAYLOAD',
            'tournament payload is invalid',
            cors.allowedOrigin,
            error.params,
            routeMethods,
          );
        }
        throw error;
      }

      const registryHash = buildPublicTournamentRegistryHash(normalizedPayload);
      const publicId = randomUUID();
      const deleteToken = randomUUID();
      const record = toPublicTournamentRecord(
        normalizedPayload,
        registryHash,
        publicId,
        sha256Text(deleteToken),
        createdAt,
      );

      try {
        const result = await createOrResolveTournament(repository, record);
        const responseBody: PublicTournamentRegisterResponse = {
          status: result.created ? 'created' : 'duplicate',
          publicId: result.record.publicId,
          ...(result.created ? { deleteToken } : {}),
        };
        await repository.insertAuditLog(
          createAuditEntry(
            result.created ? 'accepted' : 'duplicate',
            requestFingerprint,
            createdAt,
            auditOrigin,
            {
              publicId: result.record.publicId,
              registryHash,
              details: {
                status: responseBody.status,
              },
            },
          ),
        );

        return jsonResponse(
          result.created ? 201 : 200,
          responseBody,
          cors.allowedOrigin,
          routeMethods,
        );
      } catch (error) {
        await repository.insertAuditLog(
          createAuditEntry(
            'internal_error',
            requestFingerprint,
            createdAt,
            auditOrigin,
            {
              registryHash,
            },
          ),
        );
        console.error('public tournament registration failed', error);
        return errorResponse(
          500,
          'INTERNAL_ERROR',
          'failed to register tournament',
          cors.allowedOrigin,
          undefined,
          routeMethods,
        );
      }
    },
  };
}

const worker = createWorkerHandler();

export default worker;
