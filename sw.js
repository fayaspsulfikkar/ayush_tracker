/* ============================================
   AI Spectator — Service Worker
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

const CACHE_VERSION = 'ai-spectator-v1';

// List of files to pre-cache when the service worker installs.
// These files will be available offline immediately after first load.
const FILES_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worker.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  // MediaPipe model files will be added in Step 2
];

/**
 * INSTALL EVENT
 * Runs when the service worker is first installed.
 * We open a cache and add all our app files to it.
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
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
  console.log('[SW] Activating service worker...');

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
 * Strategy: Cache-first for our app files.
 * For external resources (like Google Fonts), use network-first
 * so they get cached after the first successful load.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For Google Fonts (CSS and font files): network-first with cache fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response because we need to use it twice:
          // once to cache it, once to return it
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Network failed — try cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // For everything else: cache-first with network fallback
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache — fetch from network
        return fetch(event.request)
          .then((response) => {
            // Only cache successful responses from our origin
            if (response.ok && url.origin === self.location.origin) {
              const responseClone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          });
      })
  );
});
