import type { SongMasterServiceOptions } from '@iidx/db';

export type SongMasterSource = 'github_latest_download' | 'local_mock_dev';

export interface SongMasterRuntimeConfig
  extends Pick<SongMasterServiceOptions, 'latestJsonUrl' | 'sqliteBaseUrl' | 'requiredSchemaVersion'> {
  source: SongMasterSource;
}

export const GITHUB_RELEASE_LATEST_DOWNLOAD_BASE_URL =
  'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download';
export const GITHUB_RELEASE_LATEST_JSON_URL = `${GITHUB_RELEASE_LATEST_DOWNLOAD_BASE_URL}/latest.json`;
export const LOCAL_MOCK_BASE_URL = 'http://localhost:8787/song-master';
export const LOCAL_MOCK_LATEST_JSON_URL = `${LOCAL_MOCK_BASE_URL}/latest.json`;

const DEFAULT_REQUIRED_SCHEMA_VERSION = 33;

function parseRequiredSchemaVersion(raw: string | undefined): number {
  const parsed = Number(raw ?? String(DEFAULT_REQUIRED_SCHEMA_VERSION));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('VITE_SONG_MASTER_SCHEMA_VERSION must be a positive integer.');
  }
  return parsed;
}

export function resolveSongMasterRuntimeConfig(env: ImportMetaEnv): SongMasterRuntimeConfig {
  if (env.DEV) {
    return {
      source: 'local_mock_dev',
      latestJsonUrl: LOCAL_MOCK_LATEST_JSON_URL,
      sqliteBaseUrl: LOCAL_MOCK_BASE_URL,
      requiredSchemaVersion: parseRequiredSchemaVersion(env.VITE_SONG_MASTER_SCHEMA_VERSION),
    };
  }

  return {
    source: 'github_latest_download',
    latestJsonUrl: GITHUB_RELEASE_LATEST_JSON_URL,
    sqliteBaseUrl: GITHUB_RELEASE_LATEST_DOWNLOAD_BASE_URL,
    requiredSchemaVersion: parseRequiredSchemaVersion(env.VITE_SONG_MASTER_SCHEMA_VERSION),
  };
}
