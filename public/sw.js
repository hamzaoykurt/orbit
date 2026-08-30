// Deliberately network-only: private HTML, JS and data require a live session.
// Remove earlier offline shells, which predate server authentication.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('orbit-')).map(key => caches.delete(key)));
    } finally { await self.clients.claim(); }
  })());
});
self.addEventListener('fetch', () => {
  // The network and authentication gate own every request, including assets.
});
