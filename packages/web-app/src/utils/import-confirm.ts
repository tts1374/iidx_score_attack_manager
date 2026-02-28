import {
  decodeTournamentPayload,
  PayloadBase64DecodeError,
  PayloadGzipDecodeError,
  PayloadJsonParseError,
  PayloadSizeError,
  PayloadValidationError,
  type DecodeTournamentPayloadResult,
} from '@iidx/shared';
import { IMPORT_CONFIRM_PATH, extractRawQueryParam } from './payload-url';

export type ImportConfirmErrorCode =
  | 'INVALID_PARAM'
  | 'DECODE_ERROR'
  | 'DECOMPRESS_ERROR'
  | 'JSON_ERROR'
  | 'SCHEMA_ERROR'
  | 'TOO_LARGE'
  | 'EXPIRED'
  | 'MASTER_MISSING'
  | 'CHART_NOT_FOUND'
  | 'UNSUPPORTED_VERSION';

export interface ImportConfirmError {
  code: ImportConfirmErrorCode;
  message: string;
}

export type ImportLocationPayloadResult =
  | { status: 'none' }
  | { status: 'invalid'; error: ImportConfirmError }
  | { status: 'ready'; rawPayloadParam: string; payload: DecodeTournamentPayloadResult['payload'] };

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isImportConfirmPath(pathname: string): boolean {
  return normalizePathname(pathname) === IMPORT_CONFIRM_PATH;
}

function normalizeBase64Input(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (normalized.length === 0) {
    throw new PayloadValidationError({ reason: 'PAYLOAD_REQUIRED' });
  }

  const remainder = normalized.length % 4;
  if (remainder === 1) {
    throw new PayloadBase64DecodeError();
  }
  if (remainder === 0) {
    return normalized;
  }
  return `${normalized}${'='.repeat(4 - remainder)}`;
}

export function decodeImportPayload(rawParam: string): DecodeTournamentPayloadResult {
  const urlDecoded = decodeURIComponent(rawParam);
  const normalizedBase64 = normalizeBase64Input(urlDecoded);
  return decodeTournamentPayload(normalizedBase64);
}

export function resolveImportPayloadFromLocation(locationLike: {
  pathname: string;
  search: string;
}): ImportLocationPayloadResult {
  if (!isImportConfirmPath(locationLike.pathname)) {
    return { status: 'none' };
  }
  const rawPayloadParam = extractRawQueryParam(locationLike.search, 'p');
  if (!rawPayloadParam || rawPayloadParam.trim().length === 0) {
    return {
      status: 'invalid',
      error: {
        code: 'INVALID_PARAM',
        message: 'invalid_param',
      },
    };
  }

  try {
    const decoded = decodeImportPayload(rawPayloadParam);
    return {
      status: 'ready',
      rawPayloadParam,
      payload: decoded.payload,
    };
  } catch (error) {
    return {
      status: 'invalid',
      error: classifyImportDecodeError(error),
    };
  }
}

export function classifyImportDecodeError(error: unknown): ImportConfirmError {
  if (error instanceof PayloadBase64DecodeError) {
    return {
      code: 'DECODE_ERROR',
      message: 'decode_error',
    };
  }
  if (error instanceof PayloadGzipDecodeError) {
    return {
      code: 'DECOMPRESS_ERROR',
      message: 'decompress_error',
    };
  }
  if (error instanceof PayloadJsonParseError) {
    return {
      code: 'JSON_ERROR',
      message: 'json_error',
    };
  }
  if (error instanceof PayloadSizeError) {
    return {
      code: 'TOO_LARGE',
      message: 'too_large',
    };
  }
  if (error instanceof PayloadValidationError) {
    const reason = typeof error.params?.reason === 'string' ? error.params.reason : null;
    if (reason === 'PAYLOAD_REQUIRED') {
      return {
        code: 'INVALID_PARAM',
        message: 'invalid_param',
      };
    }
    if (reason === 'UNSUPPORTED_VERSION') {
      return {
        code: 'UNSUPPORTED_VERSION',
        message: 'unsupported_version',
      };
    }
    return {
      code: 'SCHEMA_ERROR',
      message: 'schema_error',
    };
  }
  if (error instanceof URIError) {
    return {
      code: 'DECODE_ERROR',
      message: 'decode_error',
    };
  }
  return {
    code: 'SCHEMA_ERROR',
    message: 'schema_error',
  };
}

export { extractRawQueryParam };
