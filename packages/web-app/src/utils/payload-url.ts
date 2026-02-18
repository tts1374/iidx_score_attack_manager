function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function resolveBasePath(): string {
  const configuredBase = import.meta.env.BASE_URL ?? '/';
  if (configuredBase === '/' || configuredBase.length === 0) {
    return '';
  }
  const withLeadingSlash = configuredBase.startsWith('/') ? configuredBase : `/${configuredBase}`;
  return normalizePathname(withLeadingSlash);
}

const BASE_PATH = resolveBasePath();

export const HOME_PATH = BASE_PATH ? `${BASE_PATH}/` : '/';
export const IMPORT_CONFIRM_PATH = `${BASE_PATH}/import/confirm`;
export const CREATE_TOURNAMENT_PATH = `${BASE_PATH}/tournaments/new`;
export const CREATE_TOURNAMENT_CONFIRM_PATH = `${CREATE_TOURNAMENT_PATH}/confirm`;

export function buildImportUrl(payloadBase64: string): string {
  const url = new URL(window.location.origin);
  url.pathname = IMPORT_CONFIRM_PATH;
  url.search = '';
  url.hash = '';
  url.searchParams.set('p', payloadBase64);
  return url.toString();
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

export function buildImportConfirmPath(rawPayloadParam: string | null): string {
  if (rawPayloadParam === null) {
    return IMPORT_CONFIRM_PATH;
  }
  return `${IMPORT_CONFIRM_PATH}?p=${rawPayloadParam}`;
}

export function resolveRawImportPayloadParam(value: string, allowRawPayload = true): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return extractRawQueryParam(url.search, 'p');
  } catch {
    if (!allowRawPayload) {
      return null;
    }
    return encodeURIComponent(trimmed);
  }
}

export function tryExtractPayloadFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.searchParams.get('p');
  } catch {
    return null;
  }
}

export function extractPayloadFromFreeText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const fromUrl = tryExtractPayloadFromUrl(trimmed);
  if (fromUrl) {
    return fromUrl;
  }

  return trimmed;
}
