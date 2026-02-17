const CACHE_NAME = 'iidx-app-shell-v1';
const APP_SHELL = ['/', '/index.html'];
const SONG_MASTER_LATEST_JSON_RE =
  /^\/tts1374\/iidx_all_songs_master\/releases\/latest\/download\/latest\.json$/;
const SONG_MASTER_SQLITE_RE =
  /^\/tts1374\/iidx_all_songs_master\/releases\/latest\/download\/.+\.sqlite$/i;

function shouldBypassSongMasterCache(urlText) {
  const parsed = new URL(urlText);
  return SONG_MASTER_LATEST_JSON_RE.test(parsed.pathname) || SONG_MASTER_SQLITE_RE.test(parsed.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (shouldBypassSongMasterCache(event.request.url)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
    }),
  );
});
