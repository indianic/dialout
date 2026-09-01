// DevDash service worker.
//
// Deliberately minimal: it exists to receive push notifications, not to cache
// the app. A caching service worker on a dashboard whose whole job is showing
// live state would be actively harmful — stale port statuses and stale
// terminal lists are worse than a slow load.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload must still surface something rather than nothing.
  }

  const title = data.title || 'DevDash';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag replaces the previous notification for that session instead
      // of stacking one per status change.
      tag: data.tag || 'devdash',
      data: { url: data.url || '/' },
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  // Focus an already-open DevDash tab rather than opening a second one.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
