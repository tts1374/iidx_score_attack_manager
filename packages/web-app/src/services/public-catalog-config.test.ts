import { describe, expect, it } from 'vitest';

import { resolvePublicCatalogRuntimeConfig } from './public-catalog-config';

describe('resolvePublicCatalogRuntimeConfig', () => {
  it('disables local publish when no public catalog URL is configured', () => {
    const config = resolvePublicCatalogRuntimeConfig({} as ImportMetaEnv);

    expect(config).toEqual({
      apiBaseUrl: null,
      source: 'disabled',
    });
  });

  it('normalizes configured public catalog URLs', () => {
    const config = resolvePublicCatalogRuntimeConfig({
      VITE_PUBLIC_CATALOG_API_BASE_URL: 'https://example.workers.dev',
    } as ImportMetaEnv);

    expect(config).toEqual({
      apiBaseUrl: 'https://example.workers.dev/',
      source: 'env',
    });
  });

  it('rejects invalid public catalog URLs', () => {
    expect(() =>
      resolvePublicCatalogRuntimeConfig({
        VITE_PUBLIC_CATALOG_API_BASE_URL: '/relative-path',
      } as ImportMetaEnv),
    ).toThrow('VITE_PUBLIC_CATALOG_API_BASE_URL');
  });
});
