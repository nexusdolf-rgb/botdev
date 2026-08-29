// BotDev - Service Worker (mode app installable + chargement hors ligne)
// Stratégie : HTML/JS/CSS en réseau d'abord (toujours à jour),
// images/icônes en cache d'abord. L'API passe toujours par le réseau.
const CACHE = 'botdev-v170';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/nexora-robot-mark-192.png',
  '/icons/nexora-robot-mark.png',
  '/icons/nexora-robot-mark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api')) return;

  const isDynamic = url.pathname === '/'
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.webmanifest');

  if (isDynamic) {
    // Réseau d'abord : la nouvelle version arrive toujours, cache en secours
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Images/icônes : cache d'abord
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp.ok && url.origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return resp;
      });
    })
  );
});
