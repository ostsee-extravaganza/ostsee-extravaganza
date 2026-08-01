/* ============================================================================
   sw.js — offline support, aimed squarely at Rügen's dead zones.

   Strategy per kind of request:
     navigation        network first, cached page as fallback, then the Start page
     data/*.json       network first, cached copy as fallback
     static assets     cache first, refreshed in the background
     OSM map tiles     cache first, capped so the browser does not fill up
     Open-Meteo        network first, last good response as fallback

   Network-first for pages and data means an online visit always sees the
   current site; the cache only steps in when the network does not answer.
   ========================================================================= */

const VERSION = 'v5';
const SHELL = `ose-shell-${VERSION}`;
const DATA = `ose-data-${VERSION}`;
const TILES = `ose-tiles-${VERSION}`;
const API = `ose-api-${VERSION}`;

const TILE_CAP = 400;

/* Everything needed to open the site cold with no network. */
const PRECACHE = [
  './',
  'index.html', 'plan.html', 'karte.html', 'spots.html', 'galerie.html',
  'logbuch.html', 'wetter.html', 'packliste.html', 'kilometer.html', 'superlative.html',
  'assets/css/site.css',
  'assets/js/core.js', 'assets/js/home.js', 'assets/js/plan.js', 'assets/js/karte.js',
  'assets/js/spots.js', 'assets/js/galerie.js', 'assets/js/logbuch.js', 'assets/js/wetter.js',
  'assets/js/packliste.js', 'assets/js/kilometer.js', 'assets/js/superlative.js',
  'assets/js/store.js', 'assets/js/stub.js',
  'assets/fonts/oswald-latin.woff2', 'assets/fonts/oswald-latin-ext.woff2',
  'assets/fonts/worksans-latin.woff2', 'assets/fonts/worksans-latin-ext.woff2',
  'assets/fonts/worksans-italic-latin.woff2',
  'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css',
  'assets/vendor/leaflet/images/marker-icon.png',
  'assets/vendor/leaflet/images/marker-icon-2x.png',
  'assets/vendor/leaflet/images/marker-shadow.png',
  'assets/img/motifs/favicon.svg',
  'data/trip.json', 'data/stays.json', 'data/transport.json', 'data/itinerary.json',
  'data/spots.json', 'data/credits.json', 'data/photos.json', 'data/posts.json',
  'data/klima.json', 'data/packliste.json', 'data/superlative.json',
  /* data/instagram.json is optional — it only exists once the sync has run */
];

const isTile = (u) => /(^|\.)tile\.openstreetmap\.org$/.test(u.hostname);
const isAPI = (u) => /open-meteo\.com$/.test(u.hostname);

/* --- install / activate -------------------------------------------------- */

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then(async (c) => {
      /* addAll is all-or-nothing; one 404 would abandon the whole install */
      await Promise.all(
        PRECACHE.map((u) =>
          c.add(new Request(u, { cache: 'reload' })).catch(() => {
            console.warn('[sw] could not precache', u);
          })
        )
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keep = new Set([SHELL, DATA, TILES, API]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

/* --- helpers ------------------------------------------------------------- */

/**
 * Look for a cached copy anywhere, not just in one named cache.
 *
 * Two traps this avoids: precached files land in SHELL while runtime copies
 * land in DATA, and a Request created with `cache: 'no-store'` or `'no-cache'`
 * will not always match a stored entry. Retrying against the bare URL string
 * covers both.
 */
async function anyCached(req, cacheName) {
  const cache = await caches.open(cacheName);
  return (
    (await cache.match(req)) ||
    (await cache.match(req.url)) ||
    (await caches.match(req)) ||
    (await caches.match(req.url))
  );
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await anyCached(req, cacheName);
    if (hit) return hit;
    throw new Error('offline and nothing cached');
  }
}

async function cacheFirst(req, cacheName, cap) {
  const cache = await caches.open(cacheName);
  const hit = await anyCached(req, cacheName);
  if (hit) {
    /* refresh quietly for next time; failure is fine, we already served */
    fetch(req).then((r) => r && r.ok && cache.put(req, r.clone())).catch(() => {});
    return hit;
  }
  const res = await fetch(req);
  if (res && res.ok) {
    await cache.put(req, res.clone());
    if (cap) trim(cacheName, cap);
  }
  return res;
}

/** Crude FIFO trim — enough to stop the tile cache growing without bound. */
async function trim(cacheName, cap) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= cap) return;
  for (const k of keys.slice(0, keys.length - cap)) await cache.delete(k);
}

/* --- routing ------------------------------------------------------------- */

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isTile(url)) {
    e.respondWith(
      cacheFirst(request, TILES, TILE_CAP).catch(
        () =>
          /* a transparent 1px tile beats a broken-image grid */
          new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          )
      )
    );
    return;
  }

  if (isAPI(url)) {
    e.respondWith(networkFirst(request, API).catch(() => Response.error()));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith(
      networkFirst(request, SHELL).catch(async () => {
        const c = await caches.open(SHELL);
        return (
          (await anyCached(request, SHELL)) ||
          (await c.match('index.html')) ||
          (await c.match('./')) ||
          new Response('Offline und diese Seite ist nicht im Cache.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      })
    );
    return;
  }

  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    e.respondWith(networkFirst(request, DATA).catch(() => Response.error()));
    return;
  }

  e.respondWith(cacheFirst(request, SHELL).catch(() => Response.error()));
});
