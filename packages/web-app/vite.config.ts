import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Project Pages (https://<user>.github.io/<repo>/) の場合:
  base: '/iidx_score_attack_manager/',
  // User Pages (https://<user>.github.io/) の場合は base: '/' に戻す
  optimizeDeps: {
    exclude: [
      '@sqlite.org/sqlite-wasm',
      '@iidx/db',
    ],
  },
  define: {
    global: 'globalThis',
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
