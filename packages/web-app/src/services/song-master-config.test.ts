import { describe, expect, it } from 'vitest';

import {
  GITHUB_RELEASE_LATEST_DOWNLOAD_BASE_URL,
  GITHUB_RELEASE_LATEST_JSON_URL,
  LOCAL_MOCK_BASE_URL,
  LOCAL_MOCK_LATEST_JSON_URL,
  resolveSongMasterRuntimeConfig,
} from './song-master-config';

describe('resolveSongMasterRuntimeConfig', () => {
  it('resolves to local mock URLs when running in dev', () => {
    const env = {
      DEV: true,
      VITE_SONG_MASTER_SCHEMA_VERSION: '33',
    } as ImportMetaEnv;

    const config = resolveSongMasterRuntimeConfig(env);
    expect(config.source).toBe('local_mock_dev');
    expect(config.latestJsonUrl).toBe(LOCAL_MOCK_LATEST_JSON_URL);
    expect(config.sqliteBaseUrl).toBe(LOCAL_MOCK_BASE_URL);
    expect(config.requiredSchemaVersion).toBe(33);
  });

  it('resolves to fixed GitHub latest download URLs when not running in dev', () => {
    const env = {
      DEV: false,
      VITE_SONG_MASTER_SCHEMA_VERSION: '33',
    } as ImportMetaEnv;

    const config = resolveSongMasterRuntimeConfig(env);
    expect(config.source).toBe('github_latest_download');
    expect(config.latestJsonUrl).toBe(GITHUB_RELEASE_LATEST_JSON_URL);
    expect(config.sqliteBaseUrl).toBe(GITHUB_RELEASE_LATEST_DOWNLOAD_BASE_URL);
    expect(config.requiredSchemaVersion).toBe(33);
  });

  it('throws when schema version is invalid', () => {
    const env = {
      VITE_SONG_MASTER_SCHEMA_VERSION: '0',
    } as ImportMetaEnv;
    expect(() => resolveSongMasterRuntimeConfig(env)).toThrow('VITE_SONG_MASTER_SCHEMA_VERSION');
  });
});
