import { describe, expect, it } from 'vitest';

import {
  buildImportConfirmPath,
  buildImportUrl,
  HOME_PATH,
  IMPORT_CONFIRM_PATH,
  resolveRawImportPayloadParam,
} from './payload-url';

describe('payload url utility', () => {
  it('builds import confirm link', () => {
    window.history.replaceState({}, '', `${HOME_PATH}settings?foo=bar`);
    const built = new URL(buildImportUrl('abc123'));
    expect(built.pathname).toBe(IMPORT_CONFIRM_PATH);
    expect(built.searchParams.get('p')).toBe('abc123');
  });

  it('builds import confirm path with raw param', () => {
    expect(buildImportConfirmPath('abc%2Bdef')).toBe(`${IMPORT_CONFIRM_PATH}?p=abc%2Bdef`);
    expect(buildImportConfirmPath('')).toBe(`${IMPORT_CONFIRM_PATH}?p=`);
    expect(buildImportConfirmPath(null)).toBe(IMPORT_CONFIRM_PATH);
  });

  it('extracts raw p value from URL text', () => {
    const raw = resolveRawImportPayloadParam('https://example.com/repo/import/confirm?p=abc%2Bdef', false);
    expect(raw).toBe('abc%2Bdef');
  });

  it('returns null when URL text does not have p', () => {
    const raw = resolveRawImportPayloadParam('https://example.com/repo/import/confirm?x=1', false);
    expect(raw).toBeNull();
  });

  it('preserves malformed raw p value from URL text', () => {
    const raw = resolveRawImportPayloadParam('https://example.com/repo/import/confirm?p=%E0%A4%A', false);
    expect(raw).toBe('%E0%A4%A');
  });

  it('encodes raw payload when non URL text is allowed', () => {
    const raw = resolveRawImportPayloadParam('abc+def', true);
    expect(raw).toBe('abc%2Bdef');
  });

  it('returns null for non URL text when raw payload is disallowed', () => {
    const raw = resolveRawImportPayloadParam('abc+def', false);
    expect(raw).toBeNull();
  });
});
