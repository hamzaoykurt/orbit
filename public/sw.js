// Static-asset cache only. HTML, /api/*, auth and media are never cached: they are
// private and require a live session. Hashed bundles and icons are immutable
// public application code, so they are served from the cache after first use.
const CACHE = 'orbit-static-v1';
const MAX_ENTRIES = 160;
const STATIC = /^\/(?:_next\/static\/.+|manifest\.webmanifest|favicon\.(?:png|svg)|apple-touch-icon\.png|orbit-(?:favicon|icon|apple-touch|mark)[\w-]*\.png|icon-(?:192|512)\.png)$/;

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      // Older shells (orbit-shell-*) and previous static versions go away.
      await Promise.all(keys.filter(key => key.startsWith('orbit-') && key !== CACHE).map(key => caches.delete(key)));
    } catch { /* Cache storage unavailable: the network path still works. */ }
    finally { await self.clients.claim(); }
  })());
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(request);
}
async function fromCacheOrNetwork(request) {
  let cache;
  try { cache = await caches.open(CACHE); } catch { return fetch(request); }
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Only a genuine same-origin 200: never a login redirect, error page or opaque reply.
  if (response.status === 200 && (response.type === 'basic' || response.type === 'default') && !response.redirected && !/no-store/i.test(response.headers.get('Cache-Control') || '') && !/text\/html/i.test(response.headers.get('Content-Type') || '')) {
    try { await cache.put(request, response.clone()); await trim(cache); } catch { /* Quota: serve uncached. */ }
  }
  return response;
}
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !STATIC.test(url.pathname)) return;
  event.respondWith(fromCacheOrNetwork(request));
});
