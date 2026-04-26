import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

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

function createManifestPlugin(basePath: string): Plugin {
  const manifest = {
    name: 'スコアタログ',
    short_name: 'スコアタログ',
    start_url: basePath,
    display: 'standalone',
    background_color: '#f4f6fb',
    theme_color: '#243a5e',
    icons: [
      {
        src: `${basePath}icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  return {
    name: 'iidx-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(`${basePath}manifest.webmanifest`)) {
          next();
          return;
        }

        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.end(`${JSON.stringify(manifest, null, 2)}\n`);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

const basePath = resolveBasePath();

export default defineConfig({
  plugins: [react(), createManifestPlugin(basePath)],
  // e.g. /iidx_score_attack_manager/ (prod), /iidx_score_attack_manager-stg/ (stg)
  base: basePath,
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
    setupFiles: ['./src/test/setup.ts'],
  },
});
