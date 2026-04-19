import {
  PayloadValidationError,
  buildPublicTournamentRegistryHash,
  normalizeTournamentPayload,
  type ErrorParams,
  type PublicCatalogApiErrorCode,
  type PublicCatalogApiErrorResponse,
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

export const REGISTER_PUBLIC_TOURNAMENT_PATH = '/api/public-tournaments';

const MAX_REQUEST_BODY_BYTES = 32 * 1024;

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

function buildJsonHeaders(allowedOrigin: string | null): Headers {
  const headers = createVaryHeaders();
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (allowedOrigin) {
    mergeHeaders(headers, createCorsHeaders(allowedOrigin));
  }
  return headers;
}

function jsonResponse<T>(
  status: number,
  body: T,
  allowedOrigin: string | null,
  extraHeaders?: HeadersInit,
): Response {
  const headers = buildJsonHeaders(allowedOrigin);
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
  extraHeaders?: HeadersInit,
): Response {
  const body: PublicCatalogApiErrorResponse = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  return jsonResponse(status, body, allowedOrigin, extraHeaders);
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

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
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

  const rawBody = await request.text();
  if (rawBody.trim().length === 0) {
    throw new ApiError(400, 'BAD_REQUEST', 'request body is required');
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'request body too large');
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
      if (url.pathname !== REGISTER_PUBLIC_TOURNAMENT_PATH) {
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 404, headers: createVaryHeaders() });
        }
        return errorResponse(404, 'NOT_FOUND', 'route not found', null);
      }

      let config;
      try {
        config = parsePublicCatalogConfig(env);
      } catch {
        return errorResponse(500, 'INTERNAL_ERROR', 'worker configuration is invalid', null);
      }

      const cors = resolveCorsContext(request.headers.get('Origin'), config.allowedOrigins);
      if (request.method === 'OPTIONS') {
        if (!cors.allowedOrigin) {
          return new Response(null, { status: 403, headers: createVaryHeaders() });
        }
        return new Response(null, {
          status: 204,
          headers: createCorsHeaders(cors.allowedOrigin),
        });
      }

      if (request.method !== 'POST') {
        return errorResponse(
          405,
          'METHOD_NOT_ALLOWED',
          'method not allowed',
          cors.allowedOrigin,
          undefined,
          { Allow: 'POST, OPTIONS' },
        );
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
        return errorResponse(403, 'ORIGIN_NOT_ALLOWED', 'origin not allowed', null);
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
          );
        }
        throw error;
      }

      const registryHash = buildPublicTournamentRegistryHash(normalizedPayload);
      const record = toPublicTournamentRecord(
        normalizedPayload,
        registryHash,
        randomUUID(),
        createdAt,
      );

      try {
        const result = await createOrResolveTournament(repository, record);
        const responseBody: PublicTournamentRegisterResponse = {
          status: result.created ? 'created' : 'duplicate',
          publicId: result.record.publicId,
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
        );
      }
    },
  };
}

const worker = createWorkerHandler();

export default worker;
