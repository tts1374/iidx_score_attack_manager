import type {
  PublicCatalogApiErrorCode,
  PublicCatalogApiErrorResponse,
  PublicTournamentListCursor,
  PublicTournamentListItem,
  PublicTournamentListResponse,
  PublicTournamentPayloadResponse,
  PublicTournamentRegisterResponse,
  TournamentPayload,
} from '@iidx/shared';

import type { PublicCatalogRuntimeConfig } from './public-catalog-config';

const PUBLIC_TOURNAMENTS_PATH = 'api/public-tournaments';

export interface PublicCatalogErrorI18nSpec {
  key: string;
  params?: Record<string, unknown>;
}

export interface PublicCatalogClient {
  isAvailable(): boolean;
  registerTournament(
    payload: TournamentPayload,
  ): Promise<PublicTournamentRegisterResponse>;
  listPublicTournaments(options?: {
    query?: string;
    cursor?: PublicTournamentListCursor | null;
  }): Promise<PublicTournamentListResponse>;
  getPublicTournamentPayload(
    publicId: string,
  ): Promise<PublicTournamentPayloadResponse>;
  deletePublicTournament(publicId: string, deleteToken: string): Promise<void>;
}

export class PublicCatalogClientError extends Error {
  constructor(
    public readonly kind: 'api' | 'invalid_response' | 'network' | 'unavailable',
    message: string,
    public readonly code?: PublicCatalogApiErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'PublicCatalogClientError';
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isRegisterResponse(
  value: unknown,
): value is PublicTournamentRegisterResponse {
  if (!isObjectRecord(value)) {
    return false;
  }
  const publicId = value.publicId;
  const status = value.status;
  return (
    typeof publicId === 'string' &&
    publicId.trim().length > 0 &&
    (status === 'created' || status === 'duplicate') &&
    (value.deleteToken === undefined || typeof value.deleteToken === 'string')
  );
}

function isPublicTournamentListItem(
  value: unknown,
): value is PublicTournamentListItem {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.publicId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.hashtag === 'string' &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    isFiniteNumber(value.chartCount) &&
    isOptionalFiniteNumber(value.spChartCount) &&
    isOptionalFiniteNumber(value.dpChartCount) &&
    typeof value.createdAt === 'string'
  );
}

function isListResponse(value: unknown): value is PublicTournamentListResponse {
  if (!isObjectRecord(value) || !Array.isArray(value.items)) {
    return false;
  }
  return (
    value.items.every(isPublicTournamentListItem) &&
    (typeof value.nextCursor === 'string' || value.nextCursor === null)
  );
}

function isPayloadResponse(
  value: unknown,
): value is PublicTournamentPayloadResponse {
  return isObjectRecord(value) && typeof value.payloadParam === 'string';
}

function readApiErrorCode(
  value: unknown,
): PublicCatalogApiErrorCode | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value as PublicCatalogApiErrorCode;
}

function parseApiErrorResponse(
  value: unknown,
): PublicCatalogApiErrorResponse | null {
  if (!isObjectRecord(value) || !isObjectRecord(value.error)) {
    return null;
  }
  const code = readApiErrorCode(value.error.code);
  const message = value.error.message;
  if (!code || typeof message !== 'string' || message.trim().length === 0) {
    return null;
  }
  return {
    error: {
      code,
      message,
      ...(isObjectRecord(value.error.details)
        ? { details: value.error.details }
        : {}),
    },
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PublicCatalogClientError(
      'invalid_response',
      'public catalog response must be valid JSON.',
      undefined,
      response.status,
    );
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildEndpointUrl(
  baseUrl: string,
  path: string,
  searchParams?: Record<string, string | null | undefined>,
): URL {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value.length === 0) {
        return;
      }
      url.searchParams.set(key, value);
    });
  }
  return url;
}

export class FetchPublicCatalogClient implements PublicCatalogClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: PublicCatalogRuntimeConfig,
    fetchImpl?: typeof fetch,
  ) {
    const resolvedFetch = fetchImpl ?? fetch.bind(globalThis);
    this.fetchImpl = (input, init) => resolvedFetch(input, init);
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiBaseUrl);
  }

  private async requestJson(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<{ body: unknown; response: Response }> {
    let response: Response;
    try {
      response = await this.fetchImpl(input, init);
    } catch (error) {
      throw new PublicCatalogClientError(
        'network',
        error instanceof Error
          ? error.message
          : 'public catalog request failed.',
      );
    }

    const body = await readJsonResponse(response);
    if (!response.ok) {
      const apiError = parseApiErrorResponse(body);
      throw new PublicCatalogClientError(
        'api',
        apiError?.error.message ??
          `public catalog request failed with status ${response.status}.`,
        apiError?.error.code,
        response.status,
      );
    }

    return { body, response };
  }

  async registerTournament(
    payload: TournamentPayload,
  ): Promise<PublicTournamentRegisterResponse> {
    if (!this.config.apiBaseUrl) {
      throw new PublicCatalogClientError(
        'unavailable',
        'public catalog api is unavailable.',
      );
    }

    const { body, response } = await this.requestJson(
      buildEndpointUrl(this.config.apiBaseUrl, PUBLIC_TOURNAMENTS_PATH),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!isRegisterResponse(body)) {
      throw new PublicCatalogClientError(
        'invalid_response',
        'public catalog response is missing publication metadata.',
        undefined,
        response.status,
      );
    }

    return body;
  }

  async listPublicTournaments({
    query = '',
    cursor = null,
  }: {
    query?: string;
    cursor?: PublicTournamentListCursor | null;
  } = {}): Promise<PublicTournamentListResponse> {
    if (!this.config.apiBaseUrl) {
      throw new PublicCatalogClientError(
        'unavailable',
        'public catalog api is unavailable.',
      );
    }

    const { body, response } = await this.requestJson(
      buildEndpointUrl(this.config.apiBaseUrl, PUBLIC_TOURNAMENTS_PATH, {
        q: query.trim().length > 0 ? query.trim() : null,
        cursor,
      }),
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!isListResponse(body)) {
      throw new PublicCatalogClientError(
        'invalid_response',
        'public catalog list response is invalid.',
        undefined,
        response.status,
      );
    }

    return body;
  }

  async getPublicTournamentPayload(
    publicId: string,
  ): Promise<PublicTournamentPayloadResponse> {
    if (!this.config.apiBaseUrl) {
      throw new PublicCatalogClientError(
        'unavailable',
        'public catalog api is unavailable.',
      );
    }

    const { body, response } = await this.requestJson(
      buildEndpointUrl(
        this.config.apiBaseUrl,
        `${PUBLIC_TOURNAMENTS_PATH}/${encodeURIComponent(
          publicId.trim(),
        )}/payload`,
      ),
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!isPayloadResponse(body)) {
      throw new PublicCatalogClientError(
        'invalid_response',
        'public catalog payload response is invalid.',
        undefined,
        response.status,
      );
    }

    return body;
  }

  async deletePublicTournament(publicId: string, deleteToken: string): Promise<void> {
    if (!this.config.apiBaseUrl) {
      throw new PublicCatalogClientError(
        'unavailable',
        'public catalog api is unavailable.',
      );
    }

    await this.requestJson(
      buildEndpointUrl(
        this.config.apiBaseUrl,
        `${PUBLIC_TOURNAMENTS_PATH}/${encodeURIComponent(publicId.trim())}`,
      ),
      {
        method: 'DELETE',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-Public-Catalog-Delete-Token': deleteToken,
        },
      },
    );
  }
}

export function resolvePublicCatalogErrorI18n(
  error: unknown,
): PublicCatalogErrorI18nSpec {
  if (error instanceof PublicCatalogClientError) {
    if (error.kind === 'unavailable') {
      return { key: 'public_catalog.error.unavailable' };
    }
    if (error.kind === 'api' && error.code === 'RATE_LIMITED') {
      return { key: 'public_catalog.error.rate_limited' };
    }
    if (error.kind === 'api' && error.code === 'NOT_FOUND') {
      return { key: 'public_catalog.error.not_found' };
    }
    if (
      error.kind === 'network' &&
      typeof navigator !== 'undefined' &&
      navigator.onLine === false
    ) {
      return { key: 'error.network.offline' };
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      key: 'error.description.with_detail',
      params: { message: error.message },
    };
  }
  return { key: 'public_catalog.error.publish_failed' };
}
