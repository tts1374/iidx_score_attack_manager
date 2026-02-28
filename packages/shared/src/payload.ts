import { ungzip, gzip } from 'pako';
import {
  PayloadBase64DecodeError,
  PayloadGzipDecodeError,
  PayloadJsonParseError,
  PayloadSizeError,
  PayloadValidationError,
} from './errors.js';
import { sha256Text, utf8Decode, utf8Encode } from './hash.js';
import {
  canonicalTournamentPayload,
  normalizeTournamentPayload,
} from './normalize.js';
import {
  DECOMPRESSED_PAYLOAD_MAX_BYTES,
  ENCODED_PAYLOAD_MAX_BYTES,
  TournamentPayload,
  TournamentPayloadNormalizationOptions,
} from './types.js';

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw new PayloadBase64DecodeError();
  }

  try {
    if (typeof Buffer !== 'undefined') {
      const nodeDecoded = Buffer.from(normalized, 'base64');
      if (nodeDecoded.length === 0 && normalized.length > 0) {
        throw new PayloadBase64DecodeError();
      }
      return Uint8Array.from(nodeDecoded);
    }
    const decoded = atob(normalized);
    return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  } catch {
    throw new PayloadBase64DecodeError();
  }
}

export function encodeTournamentPayload(payload: TournamentPayload): string {
  const normalized = normalizeTournamentPayload(payload);
  const json = JSON.stringify(normalized);
  const compressed = gzip(utf8Encode(json));
  if (compressed.byteLength > ENCODED_PAYLOAD_MAX_BYTES) {
    throw new PayloadSizeError({
      reason: 'encoded',
      limit: ENCODED_PAYLOAD_MAX_BYTES,
      actual: compressed.byteLength,
    });
  }
  return bytesToBase64(compressed);
}

export interface DecodeTournamentPayloadResult {
  payload: TournamentPayload;
  rawJson: string;
}

export function decodeTournamentPayload(
  encoded: string,
  options: TournamentPayloadNormalizationOptions = {},
): DecodeTournamentPayloadResult {
  if (!encoded || typeof encoded !== 'string') {
    throw new PayloadValidationError({ reason: 'PAYLOAD_REQUIRED' });
  }

  const compressed = base64ToBytes(encoded);
  let unzipped: Uint8Array;
  try {
    unzipped = ungzip(compressed);
  } catch {
    throw new PayloadGzipDecodeError();
  }

  if (unzipped.byteLength > DECOMPRESSED_PAYLOAD_MAX_BYTES) {
    throw new PayloadSizeError({
      reason: 'decompressed',
      limit: DECOMPRESSED_PAYLOAD_MAX_BYTES,
      actual: unzipped.byteLength,
    });
  }

  let rawJson = '';
  let parsed: unknown;
  try {
    rawJson = utf8Decode(unzipped);
    parsed = JSON.parse(rawJson);
  } catch {
    throw new PayloadJsonParseError();
  }

  const payload = normalizeTournamentPayload(parsed, options);

  return { payload, rawJson };
}

export function buildTournamentDefHash(payload: TournamentPayload): string {
  const canonical = canonicalTournamentPayload(normalizeTournamentPayload(payload));
  return sha256Text(JSON.stringify(canonical));
}
