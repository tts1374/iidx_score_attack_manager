export interface CorsContext {
  requestOrigin: string | null;
  allowedOrigin: string | null;
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get('Vary');
  if (!current) {
    headers.set('Vary', value);
    return;
  }

  const values = current.split(',').map((entry) => entry.trim());
  if (!values.includes(value)) {
    headers.set('Vary', `${current}, ${value}`);
  }
}

export function normalizeRequestOrigin(originHeader: string | null): string | null {
  if (!originHeader) {
    return null;
  }

  try {
    return new URL(originHeader).origin;
  } catch {
    return null;
  }
}

export function resolveCorsContext(
  originHeader: string | null,
  allowedOrigins: Set<string>,
): CorsContext {
  const requestOrigin = normalizeRequestOrigin(originHeader);
  return {
    requestOrigin,
    allowedOrigin:
      requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : null,
  };
}

export function createVaryHeaders(): Headers {
  const headers = new Headers();
  appendVary(headers, 'Origin');
  return headers;
}

export function createCorsHeaders(
  allowedOrigin: string,
  allowedMethods: readonly string[] = ['POST', 'OPTIONS'],
): Headers {
  const headers = createVaryHeaders();
  appendVary(headers, 'Access-Control-Request-Method');
  appendVary(headers, 'Access-Control-Request-Headers');
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
  headers.set('Access-Control-Allow-Headers', 'content-type');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}
