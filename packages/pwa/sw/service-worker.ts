/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'iidx-app-shell-v1';
const APP_SHELL = ['/', '/index.html'];
const SONG_MASTER_LATEST_JSON_RE =
  /^\/tts1374\/iidx_all_songs_master\/releases\/latest\/download\/latest\.json$/;
const SONG_MASTER_SQLITE_RE =
  /^\/tts1374\/iidx_all_songs_master\/releases\/latest\/download\/.+\.sqlite$/i;

function shouldBypassSongMasterCache(urlText: string): boolean {
  const parsed = new URL(urlText);
  return SONG_MASTER_LATEST_JSON_RE.test(parsed.pathname) || SONG_MASTER_SQLITE_RE.test(parsed.pathname);
}

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (shouldBypassSongMasterCache(event.request.url)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => (await caches.match('/index.html')) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
    }),
  );
});
