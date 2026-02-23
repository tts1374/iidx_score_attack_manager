import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version?: string;
};
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
const buildTime = new Date().toISOString();
const DEFAULT_BASE_PATH = '/iidx_score_attack_manager/';

function resolveBasePath(): string {
  const raw = process.env.VITE_BASE_PATH;
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_BASE_PATH;
  }

  let normalized = raw.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (!normalized.endsWith('/')) {
    normalized = `${normalized}/`;
  }
  return normalized;
}

export default defineConfig({
  plugins: [react()],
  // e.g. /iidx_score_attack_manager/ (prod), /iidx_score_attack_manager-stg/ (stg)
  base: resolveBasePath(),
  optimizeDeps: {
    exclude: [
      '@sqlite.org/sqlite-wasm',
      '@iidx/db',
    ],
  },
  define: {
    global: 'globalThis',
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    port: 5173,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      clientPort: 5173,
    },
    proxy: {
      '/__song-master-proxy__': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(
            /^\/__song-master-proxy__/,
            '/tts1374/iidx_all_songs_master/releases/latest/download',
          ),
      },
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [],
  },
});
