import { describe, expect, it } from 'vitest';
import { PAYLOAD_VERSION, PayloadValidationError, encodeTournamentPayload } from '@iidx/shared';

import { classifyImportDecodeError, decodeImportPayload, extractRawQueryParam } from './import-confirm';

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

describe('import confirm utility', () => {
  it('extracts raw p value without url-decoding', () => {
    const raw = extractRawQueryParam('?p=abc%2Bdef&x=1', 'p');
    expect(raw).toBe('abc%2Bdef');
  });

  it('decodes URL-safe payload', () => {
    const encoded = encodeTournamentPayload(validPayload);
    const urlSafe = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const rawParam = encodeURIComponent(urlSafe);
    const decoded = decodeImportPayload(rawParam);
    expect(decoded.payload.uuid).toBe(validPayload.uuid);
    expect(decoded.payload.charts).toEqual([200, 100]);
  });

  it('maps unsupported version to UNSUPPORTED_VERSION', () => {
    const error = new PayloadValidationError('unsupported payload version: 2');
    const classified = classifyImportDecodeError(error);
    expect(classified.code).toBe('UNSUPPORTED_VERSION');
  });

  it('maps empty payload validation to INVALID_PARAM', () => {
    const error = new PayloadValidationError('payload string is required');
    const classified = classifyImportDecodeError(error);
    expect(classified.code).toBe('INVALID_PARAM');
  });

  it('maps malformed URL parameter to DECODE_ERROR', () => {
    let classifiedCode = '';
    try {
      decodeImportPayload('%E0%A4%A');
    } catch (error) {
      classifiedCode = classifyImportDecodeError(error).code;
    }
    expect(classifiedCode).toBe('DECODE_ERROR');
  });
});
