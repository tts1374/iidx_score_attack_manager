import type {
  PublicCatalogApiErrorCode,
  PublicCatalogApiErrorResponse,
  PublicTournamentRegisterResponse,
  TournamentPayload,
} from '@iidx/shared';

import type { PublicCatalogRuntimeConfig } from './public-catalog-config';

const REGISTER_PUBLIC_TOURNAMENT_PATH = 'api/public-tournaments';

export interface PublicCatalogErrorI18nSpec {
  key: string;
  params?: Record<string, unknown>;
}

export interface PublicCatalogClient {
  isAvailable(): boolean;
  registerTournament(payload: TournamentPayload): Promise<PublicTournamentRegisterResponse>;
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

function isRegisterResponse(value: unknown): value is PublicTournamentRegisterResponse {
  if (!isObjectRecord(value)) {
    return false;
  }
  const publicId = value.publicId;
  const status = value.status;
  return typeof publicId === 'string' && publicId.trim().length > 0 && (status === 'created' || status === 'duplicate');
}

function readApiErrorCode(value: unknown): PublicCatalogApiErrorCode | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value as PublicCatalogApiErrorCode;
}

function parseApiErrorResponse(value: unknown): PublicCatalogApiErrorResponse | null {
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
      ...(isObjectRecord(value.error.details) ? { details: value.error.details } : {}),
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
    throw new PublicCatalogClientError('invalid_response', 'public catalog response must be valid JSON.', undefined, response.status);
  }
}

export class FetchPublicCatalogClient implements PublicCatalogClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: PublicCatalogRuntimeConfig,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.config.apiBaseUrl);
  }

  async registerTournament(payload: TournamentPayload): Promise<PublicTournamentRegisterResponse> {
    if (!this.config.apiBaseUrl) {
      throw new PublicCatalogClientError('unavailable', 'public catalog api is unavailable.');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(new URL(REGISTER_PUBLIC_TOURNAMENT_PATH, this.config.apiBaseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new PublicCatalogClientError(
        'network',
        error instanceof Error ? error.message : 'public catalog request failed.',
      );
    }

    const body = await readJsonResponse(response);
    if (!response.ok) {
      const apiError = parseApiErrorResponse(body);
      throw new PublicCatalogClientError(
        'api',
        apiError?.error.message ?? `public catalog request failed with status ${response.status}.`,
        apiError?.error.code,
        response.status,
      );
    }

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
}

export function resolvePublicCatalogErrorI18n(error: unknown): PublicCatalogErrorI18nSpec {
  if (error instanceof PublicCatalogClientError) {
    if (error.kind === 'unavailable') {
      return { key: 'public_catalog.error.unavailable' };
    }
    if (error.kind === 'api' && error.code === 'RATE_LIMITED') {
      return { key: 'public_catalog.error.rate_limited' };
    }
    if (error.kind === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false) {
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
