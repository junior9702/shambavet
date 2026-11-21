const CACHE='shambavet-v7';

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text?.() || '' }; }
  const title = data.title || 'ShambaVet update';
  const options = { body: data.body || 'You have a new ShambaVet announcement.', icon: '/shambavet-icon-192.png', badge: '/shambavet-icon-192.png', data: { url: data.url || '/' }, tag: data.tag || 'shambavet-announcement', renotify: false };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) { await client.focus(); client.navigate(target); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

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
