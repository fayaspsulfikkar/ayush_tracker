/* ============================================
   Ayush_Tracker — Service Worker
   ============================================
   
   WHAT THIS DOES:
   A service worker is a script that runs in the background,
   separate from the web page. It intercepts network requests
   and can serve cached responses — this is how the app works
   offline after the first load.
   
   CACHING STRATEGY:
   "Cache first, network fallback"
   1. On install: pre-cache all essential app files
   2. On fetch: serve from cache if available, otherwise fetch from network
   3. On activate: clean up old cache versions
   
   When you update the app, bump CACHE_VERSION to force a refresh.
   ============================================ */

const CACHE_VERSION = 'ayush-tracker-v17';

// List of files to pre-cache when the service worker installs.
// These files will be available offline immediately after first load.
const FILES_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worker.js',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './fonts/JetBrainsMono-Bold.woff2',
  './fonts/Nunito-Regular.woff2',
  './fonts/Nunito-SemiBold.woff2',
  './fonts/Nunito-Bold.woff2',
  './models/vision_bundle.mjs',
  './models/face_landmarker.task',
  './models/wasm/vision_wasm_internal.js',
  './models/wasm/vision_wasm_internal.wasm',
  './models/wasm/vision_wasm_nosimd_internal.js',
  './models/wasm/vision_wasm_nosimd_internal.wasm',
];

/**
 * INSTALL EVENT
 * Runs when the service worker is first installed.
 * We open a cache and add all our app files to it.
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell & offline AI models');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        // Skip waiting so the new SW activates immediately
        return self.skipWaiting();
      })
  );
});

/**
 * ACTIVATE EVENT
 * Runs when the service worker takes control.
 * We delete old caches so we don't waste storage.
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_VERSION)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Take control of all open pages immediately
        return self.clients.claim();
      })
  );
});

/**
 * FETCH EVENT
 * Intercepts every network request the app makes.
 *
 * - Cache-first for large/immutable local assets (/models/, /fonts/, /icons/)
 * - Network-first with cache fallback for app shell documents/scripts/styles
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isImmutableAsset =
    url.origin === self.location.origin &&
    (url.pathname.includes('/models/') ||
      url.pathname.includes('/fonts/') ||
      url.pathname.includes('/icons/') ||
      url.pathname.endsWith('/favicon.ico'));

  if (isImmutableAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // For same-origin app shell files (app.js, styles.css, index.html, etc.): Network-first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Fallback for any other requests: cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request);
      })
  );
});
