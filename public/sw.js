/**
 * Service worker for WorldHistory Atlas.
 *
 * Strategy:
 *  - app shell and built assets: cache-first, then network (update in place);
 *  - /api/* : network-first with a cache fallback so the last successful
 *    response is available offline;
 *  - navigation requests: try the network, fall back to the cached shell.
 *
 * Works both on the web and inside the packaged Android app.
 */
const VERSION = 'wh-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_URLS = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

const isAsset = (url) => /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|json|webmanifest)$/i.test(url.pathname);

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background so the next visit gets the fresh copy.
    fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
    }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // external providers: let the browser handle it

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await networkFirst(request);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request).catch(() => new Response(
      JSON.stringify({ error: 'Нет соединения: данные недоступны офлайн' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
