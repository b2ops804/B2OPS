// B2OPS Service Worker — Push Notifications
const VAPID_PUBLIC_KEY = 'BPdwgzMVSFG2G0ZWO4JxYVx56WFRZH-QIUBF7bZdLPy0LpMS1g_pU8P9eg7r4zjDbH3M23dD71X-izhNPzz7q4g';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Handle incoming push
self.addEventListener('push', e => {
  let data = { title: 'B2OPS', body: 'New notification', icon: '🔔', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch(err) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      data:    { url: data.url || '/' },
      vibrate: [200, 100, 200],
      tag:     data.type || 'b2ops',
      renotify: true,
    })
  );
});

// Handle notification click — open/focus the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('b2ops') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
