import { describe, expect, it } from 'vitest';

import { VERSION_STORAGE_KEY, consumeWhatsNewVisibility } from './whats-new';

interface MockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function createMockStorage(seed: Record<string, string> = {}): {
  storage: MockStorage;
  state: Map<string, string>;
} {
  const state = new Map<string, string>(Object.entries(seed));
  const storage: MockStorage = {
    getItem: (key) => state.get(key) ?? null,
    setItem: (key, value) => {
      state.set(key, value);
    },
  };
  return { storage, state };
}

describe('consumeWhatsNewVisibility', () => {
  it('shows once for first launch of a version', () => {
    const { storage, state } = createMockStorage();
    expect(consumeWhatsNewVisibility('1.3.0', storage)).toBe(true);
    expect(state.get(VERSION_STORAGE_KEY)).toBe('1.3.0');
    expect(consumeWhatsNewVisibility('1.3.0', storage)).toBe(false);
  });

  it('shows again when version changes', () => {
    const { storage } = createMockStorage({ [VERSION_STORAGE_KEY]: '1.2.9' });
    expect(consumeWhatsNewVisibility('1.3.0', storage)).toBe(true);
    expect(consumeWhatsNewVisibility('1.3.0', storage)).toBe(false);
  });

  it('does not show when storage is unavailable', () => {
    expect(consumeWhatsNewVisibility('1.3.0', null)).toBe(false);
  });

  it('does not show when storage read fails', () => {
    const storage: MockStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        // no-op
      },
    };
    expect(consumeWhatsNewVisibility('1.3.0', storage)).toBe(false);
  });

  it('does not show when storage write fails', () => {
    const storage: MockStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(consumeWhatsNewVisibility('1.3.0', storage)).toBe(false);
  });
});
