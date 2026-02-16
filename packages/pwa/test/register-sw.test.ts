import { describe, expect, it } from 'vitest';

import { applyPwaUpdate } from '../src/register-sw';

describe('pwa helpers', () => {
  it('applyPwaUpdate is callable', () => {
    expect(typeof applyPwaUpdate).toBe('function');
  });
});
