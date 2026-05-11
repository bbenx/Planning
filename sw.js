const CACHE = 'planning-v3-push';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k.startsWith('planning-')).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Planning', body: 'Rappel' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Planning', body: event.data.text() };
    }
  }
  const title = data.title || 'Planning';
  const opts = {
    body: data.body || '',
    icon: data.icon || 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'planning-push',
    vibrate: [180, 80, 180],
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});
