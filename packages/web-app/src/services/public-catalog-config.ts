export type PublicCatalogConfigSource = 'env' | 'disabled';

export interface PublicCatalogRuntimeConfig {
  apiBaseUrl: string | null;
  source: PublicCatalogConfigSource;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function parsePublicCatalogApiBaseUrl(raw: string | undefined): string | null {
  const normalized = raw?.trim() ?? '';
  if (normalized.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('VITE_PUBLIC_CATALOG_API_BASE_URL must be an absolute URL.');
  }

  return ensureTrailingSlash(parsed.toString());
}

export function resolvePublicCatalogRuntimeConfig(env: ImportMetaEnv): PublicCatalogRuntimeConfig {
  const apiBaseUrl = parsePublicCatalogApiBaseUrl(env.VITE_PUBLIC_CATALOG_API_BASE_URL);
  if (!apiBaseUrl) {
    return {
      apiBaseUrl: null,
      source: 'disabled',
    };
  }

  return {
    apiBaseUrl,
    source: 'env',
  };
}
