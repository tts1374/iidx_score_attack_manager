export interface PublicCatalogEnv {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_SALT: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
}

export interface PublicCatalogConfig {
  allowedOrigins: Set<string>;
  rateLimitSalt: string;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
}

const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 3600;

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeOrigin(origin: string): string {
  const url = new URL(origin.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported origin protocol: ${url.protocol}`);
  }
  return url.origin;
}

function parseAllowedOrigins(value: string): Set<string> {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error('ALLOWED_ORIGINS must include at least one origin');
  }

  return new Set(entries.map(normalizeOrigin));
}

export function parsePublicCatalogConfig(env: PublicCatalogEnv): PublicCatalogConfig {
  const rateLimitSalt = env.RATE_LIMIT_SALT?.trim();
  if (!rateLimitSalt) {
    throw new Error('RATE_LIMIT_SALT is required');
  }

  return {
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    rateLimitSalt,
    rateLimitMaxRequests: parsePositiveInteger(
      env.RATE_LIMIT_MAX_REQUESTS,
      DEFAULT_RATE_LIMIT_MAX_REQUESTS,
      'RATE_LIMIT_MAX_REQUESTS',
    ),
    rateLimitWindowSeconds: parsePositiveInteger(
      env.RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
      'RATE_LIMIT_WINDOW_SECONDS',
    ),
  };
}
