// PTRC Continuity — service worker
// Strategy: cache-first app shell so the app OPENS with zero network (airplane mode),
// then network-falling-back-to-cache for navigations so a page visited once stays
// available offline forever after. All real data lives in IndexedDB (see src/db),
// this worker only ever caches the shell — never app data.

const CACHE_VERSION = 'ptrc-shell-v1';
const SHELL_ROUTES = [
  '/',
  '/today',
  '/scenes',
  '/camera',
  '/search',
  '/schedule',
  '/schedule/import',
  '/sync',
  '/settings',
  '/crew',
  '/login',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        SHELL_ROUTES.map((url) =>
          cache.add(url).catch(() => {
            /* route may not exist yet at build time; ignore */
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.png'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Static build assets: cache-first, they're content-hashed and immutable.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Navigations / pages: network-first, fall back to cache, fall back to app shell root.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/today')))
    );
    return;
  }

  // Everything else: try cache, then network.
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
