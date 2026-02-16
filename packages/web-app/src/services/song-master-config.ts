import type { SongMasterServiceOptions } from '@iidx/db';

export type SongMasterSource = 'web' | 'mock' | 'custom';

export interface SongMasterRuntimeConfig
  extends Pick<SongMasterServiceOptions, 'latestJsonUrl' | 'sqliteBaseUrl' | 'requiredSchemaVersion'> {
  source: SongMasterSource;
}

const DEFAULT_WEB_RELEASE_TAG_URL =
  'https://github.com/tts1374/iidx_all_songs_master/releases/tag/latest';
const DEFAULT_WEB_DEV_PROXY_BASE_URL = '/__song-master-proxy__';
const DEFAULT_MOCK_BASE_URL = 'http://localhost:8787/song-master';
const DEFAULT_REQUIRED_SCHEMA_VERSION = 33;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function parseSource(raw: string | undefined): SongMasterSource {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'web' || normalized === 'mock' || normalized === 'custom') {
    return normalized;
  }
  return 'web';
}

function toGithubReleaseDownloadBase(releaseTagUrl: string): string {
  const parsed = new URL(releaseTagUrl);
  if (parsed.hostname !== 'github.com') {
    throw new Error('VITE_SONG_MASTER_WEB_RELEASE_TAG_URL は github.com のURLを指定してください。');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  const matches = pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/tag\/([^/]+)$/);
  if (!matches) {
    throw new Error(
      'VITE_SONG_MASTER_WEB_RELEASE_TAG_URL は https://github.com/{owner}/{repo}/releases/tag/{tag} 形式で指定してください。',
    );
  }

  const [, owner, repo, tag] = matches;
  return `https://github.com/${owner}/${repo}/releases/download/${tag}`;
}

function parseRequiredSchemaVersion(raw: string | undefined): number {
  const parsed = Number(raw ?? String(DEFAULT_REQUIRED_SCHEMA_VERSION));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('VITE_SONG_MASTER_SCHEMA_VERSION は1以上の整数で指定してください。');
  }
  return parsed;
}

export function resolveSongMasterRuntimeConfig(env: ImportMetaEnv): SongMasterRuntimeConfig {
  const source = parseSource(env.VITE_SONG_MASTER_SOURCE);
  const requiredSchemaVersion = parseRequiredSchemaVersion(env.VITE_SONG_MASTER_SCHEMA_VERSION);

  if (source === 'custom') {
    const latestJsonUrl = env.VITE_SONG_MASTER_LATEST_URL;
    const sqliteBaseUrl = env.VITE_SONG_MASTER_BASE_URL;
    if (!latestJsonUrl || !sqliteBaseUrl) {
      throw new Error(
        'VITE_SONG_MASTER_SOURCE=custom の場合は VITE_SONG_MASTER_LATEST_URL / VITE_SONG_MASTER_BASE_URL が必須です。',
      );
    }
    return {
      source,
      latestJsonUrl,
      sqliteBaseUrl: trimTrailingSlash(sqliteBaseUrl),
      requiredSchemaVersion,
    };
  }

  if (source === 'mock') {
    const mockBase = trimTrailingSlash(env.VITE_SONG_MASTER_MOCK_BASE_URL ?? DEFAULT_MOCK_BASE_URL);
    return {
      source,
      latestJsonUrl: env.VITE_SONG_MASTER_LATEST_URL ?? `${mockBase}/latest.json`,
      sqliteBaseUrl: trimTrailingSlash(env.VITE_SONG_MASTER_BASE_URL ?? mockBase),
      requiredSchemaVersion,
    };
  }

  if (env.DEV) {
    const devProxyBase = trimTrailingSlash(
      env.VITE_SONG_MASTER_WEB_DEV_PROXY_BASE_URL ?? DEFAULT_WEB_DEV_PROXY_BASE_URL,
    );
    return {
      source,
      latestJsonUrl: env.VITE_SONG_MASTER_LATEST_URL ?? `${devProxyBase}/latest.json`,
      sqliteBaseUrl: trimTrailingSlash(env.VITE_SONG_MASTER_BASE_URL ?? devProxyBase),
      requiredSchemaVersion,
    };
  }

  const downloadBase = trimTrailingSlash(
    toGithubReleaseDownloadBase(env.VITE_SONG_MASTER_WEB_RELEASE_TAG_URL ?? DEFAULT_WEB_RELEASE_TAG_URL),
  );

  return {
    source,
    latestJsonUrl: env.VITE_SONG_MASTER_LATEST_URL ?? `${downloadBase}/latest.json`,
    sqliteBaseUrl: trimTrailingSlash(env.VITE_SONG_MASTER_BASE_URL ?? downloadBase),
    requiredSchemaVersion,
  };
}
