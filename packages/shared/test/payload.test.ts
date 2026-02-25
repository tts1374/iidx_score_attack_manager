import { describe, expect, it } from 'vitest';
import {
  PAYLOAD_VERSION,
  PayloadBase64DecodeError,
  PayloadGzipDecodeError,
  PayloadValidationError,
  buildTournamentDefHash,
  decodeTournamentPayload,
  encodeTournamentPayload,
  normalizeTournamentPayload,
} from '../src/index.js';

const validPayload = {
  v: PAYLOAD_VERSION,
  uuid: '9f5fb95d-0f2a-4270-81c9-a7f4b58f32af',
  name: 'TEST TOURNAMENT',
  owner: 'owner',
  hashtag: 'iidx',
  start: '2026-02-01',
  end: '2026-02-28',
  charts: [200, 100],
};

describe('payload encode/decode', () => {
  it('normalizes payload without changing chart order', () => {
    const normalized = normalizeTournamentPayload(validPayload);
    expect(normalized.charts).toEqual([200, 100]);
  });

  it('normalizes hashtag with hash prefixes and spaces', () => {
    const normalized = normalizeTournamentPayload({
      ...validPayload,
      hashtag: '  ###　大会 2026  ',
    });
    expect(normalized.hashtag).toBe('大会2026');
  });

  it('clamps long hashtag length', () => {
    const normalized = normalizeTournamentPayload({
      ...validPayload,
      hashtag: `#${'a'.repeat(80)}`,
    });
    expect(normalized.hashtag).toHaveLength(50);
  });

  it('rejects hashtag that becomes empty after normalization', () => {
    expect(() => normalizeTournamentPayload({ ...validPayload, hashtag: '###' })).toThrowError(PayloadValidationError);
  });

  it('encodes then decodes while preserving chart order', () => {
    const encoded = encodeTournamentPayload(validPayload);
    const decoded = decodeTournamentPayload(encoded);
    expect(decoded.payload.charts).toEqual([200, 100]);
  });

  it('throws on invalid base64', () => {
    expect(() => decodeTournamentPayload('@@@@')).toThrowError(PayloadBase64DecodeError);
  });

  it('throws on invalid gzip', () => {
    expect(() => decodeTournamentPayload('e30=')).toThrowError(PayloadGzipDecodeError);
  });

  it('rejects too many charts', () => {
    expect(() => normalizeTournamentPayload({ ...validPayload, charts: [1, 2, 3, 4, 5] })).toThrowError(
      PayloadValidationError,
    );
  });

  it('produces same hash regardless chart order', () => {
    const a = buildTournamentDefHash(validPayload);
    const b = buildTournamentDefHash({ ...validPayload, charts: [100, 200] });
    expect(a).toBe(b);
  });
});
