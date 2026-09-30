// CardinalMap service worker v10 - dynamic shell manifest.
const VERSION = 'cardinalmap-v10';
const SHELL_CACHE = `${VERSION}-shell`;
const TILE_CACHE  = `${VERSION}-tiles`;
const DATA_CACHE  = `${VERSION}-data`;
const TILE_MAX = 50;

const SHELL_FALLBACK = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    let manifest = { items: [] };
    try {
      const r = await fetch('/api/shell-manifest');
      if (r.ok) manifest = await r.json();
    } catch (e) { /* offline install */ }
    const urls = [
      ...SHELL_FALLBACK,
      ...(manifest.items || []).map(i => i.path),
      '/js/app.js',
    ];
    await Promise.allSettled(urls.map((u) => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const isAppCode = url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/');
    if (isAppCode) return; // pass through; server sends no-cache/no-store
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          if (res && res.status === 200 && (req.destination === 'document' || req.destination === 'image' || req.destination === 'font')) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('/index.html'))
      )
    );
    return;
  }

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
                await Promise.all(keys.slice(0, keys.length - TILE_MAX).map((k) => cache.delete(k)));
              }
            }).catch(() => {});
          }
          return res;
        } catch { return new Response('', { status: 504 }); }
      })
    );
    return;
  }

  event.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
});