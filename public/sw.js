// Hoxera - Service Worker (mode app installable + chargement hors ligne)
// Stratégie : HTML/JS/CSS en réseau d'abord (toujours à jour),
// images/icônes en cache d'abord. L'API passe toujours par le réseau.
// v406f — Les fichiers du site portent une adresse signée par leur contenu
// (« ?v=406f-1a2b3c ») : un fichier qui change change d'adresse. Le service
// worker les laisse donc passer par le cache HTTP normal, sans les recopier
// dans le sien : une seule copie, et plus de risque de servir à un visiteur un
// CSS d'une version et un JS d'une autre (le défaut qui avait laissé le
// bandeau d'icônes affiché après un correctif). Seules les images restent en
// cache d'abord, et `/` est toujours demandé au réseau d'abord.
// v399 — nouveau nom de cache : tous les anciens sont supprimés à
// l'activation. Sans ce changement, un navigateur déjà venu garderait
// l'ancien app.js pendant des heures. Les fichiers ?v=399 ne bougent pas :
// ce sont eux qui datent le code, et sw.js les télécharge à neuf.
// (Le nom de cache ci-dessous ne doit apparaître qu'à cet endroit : les
// tests lisent le premier numéro de version qu'ils trouvent dans ce fichier.)
const CACHE = 'hoxera-v406f';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
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

  // v406f — Les fichiers signés (« ?v=…-empreinte ») sont laissés au cache
  // HTTP : leur adresse change avec leur contenu, le navigateur les garde un
  // an et ne peut pas mélanger deux versions. En faire une copie de plus ici
  // n'apportait que le risque de servir une copie ancienne.
  const signe = /[?&]v=[0-9a-z]+-[0-9a-f]{16}/i.test(url.search);
  const isDynamic = url.pathname === '/'
    || (!signe && (url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.webmanifest')));

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
