// Lunao Owner Portal PWA Service Worker
//
// Cache strategy:
//   /api/*   — NetworkFirst (always fresh data, 3s timeout → cached fallback)
//   Static   — CacheFirst (precached assets + runtime caching)
//   Navigate — NetworkFirst with offline fallback to /index.html
const CACHE_NAME = 'lunao-owner-v1';
const API_TIMEOUT_MS = 3000;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[sw] Precache partial fail:', err);
      });
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // /api/* — always go to network first; fall back to cache on failure.
  // This keeps booking counts, chat transcripts, and dashboard data fresh.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('API timeout')), API_TIMEOUT_MS),
        ),
      ])
        .catch(() => caches.match(request))
        .then((res) => {
          if (res) return res;
          // Return a JSON error so the app can handle it gracefully.
          return new Response(
            JSON.stringify({ ok: false, error: 'Offline' }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }),
    );
    return;
  }

  // Navigation — network first, offline fallback to the SPA shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Static assets — cache first, fill cache on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return networkResponse;
      });
    }),
  );
});

// Listen for version-push messages from the app (cache-busting on deploy).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
