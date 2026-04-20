/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SONG_MASTER_SCHEMA_VERSION?: string;
  readonly VITE_PUBLIC_CATALOG_API_BASE_URL?: string;
}

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
