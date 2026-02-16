export function buildImportUrl(payloadBase64: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('p', payloadBase64);
  return url.toString();
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
