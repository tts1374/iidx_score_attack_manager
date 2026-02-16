import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
            '/tts1374/iidx_all_songs_master/releases/download/latest',
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
