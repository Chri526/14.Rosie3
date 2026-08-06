// sw.js — cache l'app shell pour un fonctionnement hors-ligne complet.
const CACHE_NAME = 'mon-journal-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './config.js',
  './app.js',
  './db.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return; // laisse passer Firebase/Cloudinary normalement

  // Réseau d'abord (pour toujours avoir la dernière version des fichiers),
  // secours sur le cache uniquement si hors-ligne.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
