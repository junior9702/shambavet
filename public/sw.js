// ShambaVet service worker: push notifications only.
// Do not cache HTML or JavaScript bundles: stale cached app shells can
// leave users on a blank page after a deployment.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text?.() || '' }; }
  const title = data.title || 'ShambaVet update';
  const options = { body: data.body || 'You have a new ShambaVet announcement.', icon: '/shambavet-logo.webp?v=2', badge: '/shambavet-logo.webp?v=2', data: { url: data.url || '/' }, tag: data.tag || 'shambavet-announcement', renotify: false };
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

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('shambavet-')).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
