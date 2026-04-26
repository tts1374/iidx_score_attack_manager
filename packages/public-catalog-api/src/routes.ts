export const PUBLIC_TOURNAMENTS_PATH = '/api/public-tournaments';
export const LIST_PUBLIC_TOURNAMENTS_PATH = PUBLIC_TOURNAMENTS_PATH;
export const REGISTER_PUBLIC_TOURNAMENT_PATH = PUBLIC_TOURNAMENTS_PATH;

const PUBLIC_TOURNAMENT_PAYLOAD_SUFFIX = '/payload';

export function matchPublicTournamentItemPath(pathname: string): string | null {
  const prefix = `${PUBLIC_TOURNAMENTS_PATH}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawPublicId = pathname.slice(prefix.length);
  if (!rawPublicId || rawPublicId.includes('/')) {
    return null;
  }

  try {
    const publicId = decodeURIComponent(rawPublicId);
    return publicId && !publicId.includes('/') ? publicId : null;
  } catch {
    return null;
  }
}

export function matchPublicTournamentPayloadPath(pathname: string): string | null {
  const prefix = `${PUBLIC_TOURNAMENTS_PATH}/`;
  if (
    !pathname.startsWith(prefix) ||
    !pathname.endsWith(PUBLIC_TOURNAMENT_PAYLOAD_SUFFIX)
  ) {
    return null;
  }

  const rawPublicId = pathname.slice(
    prefix.length,
    -PUBLIC_TOURNAMENT_PAYLOAD_SUFFIX.length,
  );
  if (!rawPublicId || rawPublicId.includes('/')) {
    return null;
  }

  try {
    const publicId = decodeURIComponent(rawPublicId);
    return publicId && !publicId.includes('/') ? publicId : null;
  } catch {
    return null;
  }
}
