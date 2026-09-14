/*
 * FYRO service worker.
 *
 * Deliberately small, and deliberately conservative about what it is willing
 * to serve from a cache. This app shows people where a truck is, what a job
 * pays and whether a document was approved. A stale answer to any of those is
 * worse than no answer, so:
 *
 *   - /api/** is NEVER cached or served from cache. Not a single route. Live
 *     data comes from the network or it fails loudly and the UI says so.
 *   - Navigations are network-first, falling back to the cached shell only
 *     when the network is genuinely gone — so an offline user gets the app
 *     saying "you are offline" instead of a browser error page.
 *   - Static build output (/_next/static/**) is cache-first, because those
 *     files are content-hashed: a given URL's bytes never change.
 *
 * The result is an installable app that opens instantly and survives a
 * tunnel, without ever showing a number that is no longer true.
 */

const VERSION = 'fyro-v1';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // A failed pre-cache must not stop the worker installing; the offline
      // page is a nicety, not a requirement.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Anything not on this origin (Cloudinary media, the tile server, the API
  // on its own host) is left entirely alone — no caching, no interception.
  if (url.origin !== self.location.origin) return;

  // Live data. Never touched.
  if (isApi(url)) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            // Only cache a genuinely successful response — an opaque or error
            // response cached here would be served forever under a hashed URL.
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL)))
    );
  }
});
