// BotDev - Service Worker (mode app installable + chargement hors ligne)
// Stratégie : HTML/JS/CSS en réseau d'abord (toujours à jour),
// images/icônes en cache d'abord. L'API passe toujours par le réseau.
const CACHE = 'botdev-v378';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/nexora-robot-mark-192.png',
  '/icons/nexora-robot-mark.png',
  '/icons/nexora-robot-mark.svg',
];

// 🧯 v364 — l'installation ne se joue plus a la sante d'un seul fichier :
// addAll() echoue en bloc au premier asset manquant, l'install ratee laisse
// l'ANCIEN service worker en place sans le moindre message, et la « mise a jour
// automatique » promise par ce fichier ne venait jamais. Promise.allSettled
// garde ce qui repond et ignore le reste.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
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
    // Réseau d'abord : la nouvelle version arrive toujours, cache en secours.
    // v364 — deux pieges fermes ici :
    //   • on ne met en cache QUE les réponses valides. Un 404, une page
    //     d'erreur du proxy ou un 500 de démarrage se glissaient dans le cache
    //     et se resservaient hors ligne à la place du vrai fichier ;
    //   • le secours « / » (la coquille HTML) n'est rendu QUE pour une
    //     navigation. Servir index.html à la place d'un .js, c'est offrir du
    //     HTML à un parseur JavaScript : page blanche, et aucune erreur
    //     parlante dans la console de l'utilisateur.
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('/');
          throw new Error('hors ligne');
        }))
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
