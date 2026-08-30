const CACHE_NAME = 'orbit-shell-v5';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.allSettled(APP_SHELL.map(path => cache.add(path)))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('orbit-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Authenticated data and private project photos must never be replayed from a shared cache.
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  const pathname = new URL(event.request.url).pathname;
  // Build-versioned JS, CSS and fonts do not need another network trip on reopen.
  if (pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      let cache;
      try {
        cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
      } catch { /* Storage restrictions must not prevent normal network loading. */ }
      const response = await fetch(event.request);
      if (cache && response.ok && !response.redirected && !/no-store|private/i.test(response.headers.get('Cache-Control') ?? '')) {
        event.waitUntil(cache.put(event.request, response.clone()).catch(() => undefined));
      }
      return response;
    })());
    return;
  }
  // Authentication and external-service callbacks must never be cached.
  if (pathname !== '/' && !APP_SHELL.includes(pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && !response.redirected && !/no-store|private/i.test(response.headers.get('Cache-Control') ?? '')) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('/') : Response.error())));
});
