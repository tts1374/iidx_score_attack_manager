import {
  decodeTournamentPayload,
  PayloadBase64DecodeError,
  PayloadGzipDecodeError,
  PayloadJsonParseError,
  PayloadSizeError,
  PayloadValidationError,
  type DecodeTournamentPayloadResult,
} from '@iidx/shared';

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

export function extractRawQueryParam(search: string, key: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query.length === 0) {
    return null;
  }

  for (const token of query.split('&')) {
    if (token.length === 0) {
      continue;
    }
    const separatorIndex = token.indexOf('=');
    const rawKey = separatorIndex >= 0 ? token.slice(0, separatorIndex) : token;
    let decodedKey = '';
    try {
      decodedKey = decodeURIComponent(rawKey);
    } catch {
      continue;
    }
    if (decodedKey !== key) {
      continue;
    }
    return separatorIndex >= 0 ? token.slice(separatorIndex + 1) : '';
  }

  return null;
}

export function decodeImportPayload(rawParam: string): DecodeTournamentPayloadResult {
  const urlDecoded = decodeURIComponent(rawParam);
  const normalizedBase64 = normalizeBase64Input(urlDecoded);
  return decodeTournamentPayload(normalizedBase64);
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
