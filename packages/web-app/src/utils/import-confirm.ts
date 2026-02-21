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
    throw new PayloadValidationError('payload string is required');
  }

  const remainder = normalized.length % 4;
  if (remainder === 1) {
    throw new PayloadBase64DecodeError('base64 decode failed');
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
        message: 'URLパラメータ p が見つからないか空です。',
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
      message: 'ペイロードのbase64デコードに失敗しました。',
    };
  }
  if (error instanceof PayloadGzipDecodeError) {
    return {
      code: 'DECOMPRESS_ERROR',
      message: 'ペイロードのgzip展開に失敗しました。',
    };
  }
  if (error instanceof PayloadJsonParseError) {
    return {
      code: 'JSON_ERROR',
      message: 'ペイロードJSONの解析に失敗しました。',
    };
  }
  if (error instanceof PayloadSizeError) {
    return {
      code: 'TOO_LARGE',
      message: '取り込みデータサイズが上限を超えています。',
    };
  }
  if (error instanceof PayloadValidationError) {
    if (error.message.includes('payload string is required')) {
      return {
        code: 'INVALID_PARAM',
        message: 'URLパラメータ p が空です。',
      };
    }
    if (error.message.includes('unsupported payload version')) {
      return {
        code: 'UNSUPPORTED_VERSION',
        message: '対応していないデータバージョンです。',
      };
    }
    return {
      code: 'SCHEMA_ERROR',
      message: '取り込みデータの必須項目または型が不正です。',
    };
  }
  if (error instanceof URIError) {
    return {
      code: 'DECODE_ERROR',
      message: 'URLパラメータのデコードに失敗しました。',
    };
  }
  return {
    code: 'SCHEMA_ERROR',
    message: '取り込みデータの検証に失敗しました。',
  };
}

export { extractRawQueryParam };
