import { sha256 } from '@noble/hashes/sha2.js';

export function sha256Hex(bytes: Uint8Array): string {
  const digest = sha256(bytes);
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function sha256Text(text: string): string {
  return sha256Hex(utf8Encode(text));
}
