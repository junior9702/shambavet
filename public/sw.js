const CACHE='shambavet-v8';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll([
        '/',
        '/index.html',
        '/shambavet-logo.png',
        '/shambavet-icon-192.png',
        '/shambavet-icon-512.png'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Do not intercept cross-origin requests, API calls, or the web manifest.
  // Vercel preview protection can redirect the manifest to an SSO page.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);

    try {
      const response = await fetch(request);

      if (response && response.ok) {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        await cache.put(request, copy);
      }

      return response;
    } catch (error) {
      // Never return undefined from a service-worker fetch handler.
      return cached || Response.error();
    }
  })());
});
