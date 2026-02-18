import { describe, expect, it } from 'vitest';

import {
  LOCAL_MOCK_BASE_URL,
  LOCAL_MOCK_LATEST_JSON_URL,
  PRODUCTION_SONG_MASTER_PATH_SEGMENT,
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

  it('resolves to same-origin song-master URLs when not running in dev', () => {
    const env = {
      DEV: false,
      BASE_URL: '/iidx_score_attack_manager/',
      VITE_SONG_MASTER_SCHEMA_VERSION: '33',
    } as ImportMetaEnv;

    const config = resolveSongMasterRuntimeConfig(env);
    expect(config.source).toBe('github_latest_download');
    expect(config.latestJsonUrl).toMatch(
      new RegExp(`/iidx_score_attack_manager/${PRODUCTION_SONG_MASTER_PATH_SEGMENT}/latest\\.json$`),
    );
    expect(config.sqliteBaseUrl).toMatch(
      new RegExp(`/iidx_score_attack_manager/${PRODUCTION_SONG_MASTER_PATH_SEGMENT}/$`),
    );
    expect(config.requiredSchemaVersion).toBe(33);
  });

  it('throws when schema version is invalid', () => {
    const env = {
      VITE_SONG_MASTER_SCHEMA_VERSION: '0',
    } as ImportMetaEnv;
    expect(() => resolveSongMasterRuntimeConfig(env)).toThrow('VITE_SONG_MASTER_SCHEMA_VERSION');
  });
});
