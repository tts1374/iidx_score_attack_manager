/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SONG_MASTER_SOURCE?: 'web' | 'mock' | 'custom';
  readonly VITE_SONG_MASTER_WEB_RELEASE_TAG_URL?: string;
  readonly VITE_SONG_MASTER_WEB_DEV_PROXY_BASE_URL?: string;
  readonly VITE_SONG_MASTER_MOCK_BASE_URL?: string;
  readonly VITE_SONG_MASTER_LATEST_URL?: string;
  readonly VITE_SONG_MASTER_BASE_URL?: string;
  readonly VITE_SONG_MASTER_SCHEMA_VERSION?: string;
}
