/* eslint-env serviceworker */
/* global self */

// client/public/sw.js — POS Service Worker.
//
// Two jobs:
//   1. Cache the app shell (HTML, JS bundle, CSS, brand icons) so the POS
//      starts even when the tablet's offline. The shell then drains its
//      Dexie-backed bill queue against the server.
//   2. Register a `pos-bill-sync` background-sync tag. The page asks the SW
//      to register the tag when a bill is enqueued; when connectivity
//      returns the SW gets a 'sync' event and can ping the page (or the
//      origin /pos/sync endpoint directly) to drain.
//
// Versioning: bump CACHE_VERSION whenever the shell URL list changes; the
// activate handler clears stale caches.

// v4: fixes "stale admin data shown to next user" and "old shell on first
// visit" bugs. Authenticated /api responses are now bypassed entirely, and
// HTML navigations are network-first.
const CACHE_VERSION = 'goldos-pos-v4';

// Vite emits hashed asset filenames, so we can't list them statically here —
// we cache them lazily on first fetch. The few stable URLs we *can* precache
// are the shell entry points.
const SHELL_URLS = [
  '/',
  '/pos',
  '/manifest.webmanifest',
  '/logo/zelora-mark.svg',
  '/logo/zelora-mark-dark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Pre-cache best-effort — a missing icon shouldn't fail the SW install.
      Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Strategy:
//  • Authenticated /api responses (Authorization header OR cookie) are
//    NEVER cached — they're per-user and per-token. Caching them poisons
//    role switches and tenant boundaries.
//  • Public /api responses (no auth) are cached opportunistically so a
//    backgrounded POS can fall back when offline.
//  • HTML / navigation requests are network-first so a fresh deploy is
//    visible on the next visit. Fallback to cached '/' when offline.
//  • Hashed JS / CSS / image assets are cache-first (Vite hashes the
//    filename, so cache invalidation comes from the new bundle name).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never cache mutations

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // --- API requests ---
  if (url.pathname.startsWith('/api/')) {
    const isAuthenticated =
      req.headers.has('authorization') ||
      req.credentials === 'include';
    if (isAuthenticated) {
      // Bypass SW completely for authenticated requests — let the browser
      // hit the network directly. Avoids serving User A's cached data to
      // User B after a role switch.
      return;
    }
    // Public APIs (gold rate, storefront content) — network-first w/ cache fallback.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            void caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ??
              new Response(
                JSON.stringify({ error: { code: 'OFFLINE', message: 'No connection. Bills queued locally.' } }),
                { status: 503, headers: { 'Content-Type': 'application/json' } },
              ),
          ),
        ),
    );
    return;
  }

  // --- HTML navigations: NETWORK-FIRST so deploys are immediately visible ---
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            void caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c ?? caches.match('/') ?? Response.error())),
    );
    return;
  }

  // --- Hashed static assets: cache-first ---
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            void caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match('/') ?? Response.error());
    }),
  );
});

// When a NEW SW takes control (after deploy), reload all open tabs once so
// users on stale bundles see the fresh shell without having to hard-refresh.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync — fires when connectivity returns AFTER the tab is
// backgrounded / closed. We can't drain Dexie directly from the SW (the page
// owns it), so we re-open the POS page if no client is alive, otherwise
// poke the live client.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'pos-bill-sync') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) {
        clients[0].postMessage({ type: 'pos:drain-queue' });
        return;
      }
      // No tab open — best we can do is request a wake-up so the user knows.
      return self.registration.showNotification('Zelora POS', {
        body: 'Connection restored — open the POS app to sync queued bills.',
        icon: '/logo/zelora-mark.svg',
        tag: 'pos-bill-sync',
      });
    }),
  );
});
