import { sha256Text } from '@iidx/shared';

function firstForwardedIp(value: string): string {
  const first = value.split(',')[0];
  return first?.trim() || 'unknown';
}

export function getClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIp?.trim()) {
    return cfConnectingIp.trim();
  }

  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor?.trim()) {
    return firstForwardedIp(xForwardedFor);
  }

  return 'unknown';
}

export function buildRequestFingerprint(
  request: Request,
  salt: string,
): string {
  return sha256Text(`${salt}:${getClientIp(request)}`);
}

export function getRateLimitWindowStart(
  now: Date,
  windowSeconds: number,
): string {
  return new Date(now.getTime() - windowSeconds * 1000).toISOString();
}
