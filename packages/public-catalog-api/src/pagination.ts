import type { PublicTournamentListCursor } from '@iidx/shared';

export interface PublicTournamentPageCursor {
  createdAt: string;
  publicId: string;
}

interface PublicTournamentPageCursorShape {
  createdAt: string;
  publicId: string;
}

function toBase64Url(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  return btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  if (!/^[A-Za-z0-9\-_]+$/.test(value)) {
    throw new Error('invalid cursor');
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingLength);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  return atob(padded);
}

export function encodePublicTournamentListCursor(
  cursor: PublicTournamentPageCursor,
): PublicTournamentListCursor {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodePublicTournamentListCursor(
  cursor: PublicTournamentListCursor,
): PublicTournamentPageCursor {
  if (cursor.trim().length === 0) {
    throw new Error('invalid cursor');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(cursor));
  } catch {
    throw new Error('invalid cursor');
  }

  const parsedCursor = parsed as Partial<PublicTournamentPageCursorShape> | null;
  if (
    !parsedCursor ||
    typeof parsedCursor !== 'object' ||
    typeof parsedCursor.createdAt !== 'string' ||
    typeof parsedCursor.publicId !== 'string' ||
    parsedCursor.createdAt.trim().length === 0 ||
    parsedCursor.publicId.trim().length === 0
  ) {
    throw new Error('invalid cursor');
  }

  return {
    createdAt: parsedCursor.createdAt,
    publicId: parsedCursor.publicId,
  };
}
