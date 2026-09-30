// CardinalMap service worker — cache-first shell + last-area tile cache (50 tiles).
const VERSION = 'cardinalmap-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const TILE_CACHE  = `${VERSION}-tiles`;
const DATA_CACHE  = `${VERSION}-data`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/app.js',
  '/js/map.js',
  '/js/compass.js',
  '/js/bottomSheet.js',
  '/js/search.js',
  '/js/api.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const TILE_MAX = 50;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin shell — cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          // Cache successful shell-like responses
          if (res && res.status === 200 && (req.destination === 'document' || req.destination === 'script' || req.destination === 'style' || req.destination === 'image' || req.destination === 'font')) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('/index.html'))
      )
    );
    return;
  }

  // Cross-origin: OpenFreeMap tiles. Cache up to TILE_MAX most-recent.
  if (url.host.endsWith('openfreemap.org') || url.host.endsWith('tiles.openfreemap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            const copy = res.clone();
            cache.put(req, copy).then(async () => {
              const keys = await cache.keys();
              if (keys.length > TILE_MAX) {
                const excess = keys.length - TILE_MAX;
                for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
              }
            }).catch(() => {});
          }
          return res;
        } catch (e) {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // API: network-first, fallback to cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
});
