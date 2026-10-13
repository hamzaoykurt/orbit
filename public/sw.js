// Two private, device-local caches. Neither ever holds API data, auth pages or media.
//  - orbit-static: hashed bundles and icons (application code, immutable).
//  - orbit-appshell: the authenticated HTML shell of "/", stale-while-revalidate.
//    The HTML carries no workspace data (that comes from /api/state); a response is
//    kept only if the server marked it with X-Orbit-Shell (authenticated "/", 200 HTML).
// /api/*, /auth/*, /login and everything else are never intercepted, except that
// POST /auth/logout first wipes both caches (Safari ignores Clear-Site-Data).
const CACHE = 'orbit-static-v1';
const SHELL_CACHE = 'orbit-appshell-v1';
const SHELL_URL = self.location.origin + '/';
const MAX_ENTRIES = 240;
const STATIC = /^\/(?:_next\/static\/.+|manifest\.webmanifest|favicon\.(?:png|svg)|apple-touch-icon\.png|orbit-(?:favicon|icon|apple-touch|mark)[\w-]*\.png|icon-(?:192|512)\.png)$/;
const ASSET_REFERENCE = /\/_next\/static\/[^"'\\\s<>()]+/g;

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      // Older shells (orbit-shell-*) and previous static versions go away.
      await Promise.all(keys.filter(key => key.startsWith('orbit-') && key !== CACHE && key !== SHELL_CACHE).map(key => caches.delete(key)));
    } catch { /* Cache storage unavailable: the network path still works. */ }
    finally { await self.clients.claim(); }
  })());
  // Upgrades from the old static-only worker: fill the shell too. Deliberately not
  // awaited, so activation (and with it every navigation) never waits on the network.
  primeShell();
});
// The page asks for the first fill after registering, so the NEXT launch is instant.
// (Not done inside "activate": that would hold navigations until it finishes.)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'orbit-prime-shell') event.waitUntil(primeShell());
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(request);
}
function storable(response) {
  // Only a genuine same-origin 200: never a login redirect, error page or opaque reply.
  return response.status === 200 && (response.type === 'basic' || response.type === 'default') && !response.redirected && !/no-store/i.test(response.headers.get('Cache-Control') || '') && !/text\/html/i.test(response.headers.get('Content-Type') || '');
}
async function fromCacheOrNetwork(request) {
  let cache;
  try { cache = await caches.open(CACHE); } catch { return fetch(request); }
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (storable(response)) {
    try { await cache.put(request, response.clone()); await trim(cache); } catch { /* Quota: serve uncached. */ }
  }
  return response;
}

// ---- app shell ------------------------------------------------------------
function validShell(response) {
  return response.status === 200 && response.type === 'basic' && !response.redirected
    && response.headers.get('X-Orbit-Shell') === '1' && /text\/html/i.test(response.headers.get('Content-Type') || '');
}
// Session lost or revoked: the server answers "/" with a login redirect or 401/403.
function sessionLost(response) {
  return response.type === 'opaqueredirect' || response.redirected || response.status === 401 || response.status === 403;
}
// Keep the shell and the bundles it points at consistent: fetch the missing ones first.
async function precacheAssets(html) {
  let cache;
  try { cache = await caches.open(CACHE); } catch { return; }
  const wanted = [...new Set(html.match(ASSET_REFERENCE) || [])].filter(path => STATIC.test(path.split('?')[0])).slice(0, 160);
  let next = 0;
  async function worker() {
    while (next < wanted.length) {
      const path = wanted[next++];
      try {
        const url = self.location.origin + path;
        if (await cache.match(url)) continue;
        const response = await fetch(url, { credentials: 'same-origin' });
        if (storable(response)) await cache.put(url, response.clone());
      } catch { /* Offline or gone upstream: the page falls back to the network. */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  try { await trim(cache); } catch { /* ignore */ }
}
async function storeShell(response, cache) {
  if (!validShell(response)) return false;
  try {
    await precacheAssets(await response.clone().text());
    await cache.put(SHELL_URL, response);
    return true;
  } catch { return false; }
}
async function primeShell() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    if (await cache.match(SHELL_URL)) return;
    await storeShell(await fetch(SHELL_URL, { credentials: 'same-origin' }), cache);
  } catch { /* Offline or signed out: nothing to keep. */ }
}
async function revalidateShell(request, cache) {
  try {
    const response = await fetch(request);
    if (validShell(response)) await storeShell(response, cache);
    else if (sessionLost(response) || response.ok) await cache.delete(SHELL_URL);
    // 5xx and network errors keep the last good shell: the app still opens offline.
  } catch { /* Offline. */ }
}
async function shell(event, request) {
  let cache;
  let cached;
  try { cache = await caches.open(SHELL_CACHE); cached = await cache.match(SHELL_URL); } catch { return fetch(request); }
  if (cached) {
    event.waitUntil(revalidateShell(request, cache));
    return cached;
  }
  const response = await fetch(request);
  if (validShell(response)) event.waitUntil(storeShell(response.clone(), cache));
  return response;
}
async function wipeAll() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('orbit-')).map(key => caches.delete(key)));
  } catch { /* Nothing to wipe. */ }
}
async function logout(request) {
  await wipeAll();
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname === '/auth/logout') { event.respondWith(logout(request)); return; }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && url.pathname === '/' && !url.searchParams.has('_rsc')) { event.respondWith(shell(event, request)); return; }
  if (!STATIC.test(url.pathname)) return;
  event.respondWith(fromCacheOrNetwork(request));
});
