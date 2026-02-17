import { describe, expect, it } from 'vitest';

import { buildImportUrl, HOME_PATH, IMPORT_CONFIRM_PATH } from './payload-url';

describe('payload url utility', () => {
  it('builds import confirm link', () => {
    window.history.replaceState({}, '', `${HOME_PATH}settings?foo=bar`);
    const built = new URL(buildImportUrl('abc123'));
    expect(built.pathname).toBe(IMPORT_CONFIRM_PATH);
    expect(built.searchParams.get('p')).toBe('abc123');
  });
});
