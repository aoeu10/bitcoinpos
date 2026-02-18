const CACHE_NAME = 'strike-pos-v2';
const NETWORK_FIRST_URLS = ['/', '/index.html', '/app.js', '/styles.css'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  if (url.origin !== location.origin) {
    return;
  }
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const networkFirst = NETWORK_FIRST_URLS.some((u) => path === u);

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.status === 200 && event.request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then(
        (res) => {
          const clone = res.clone();
          if (res.status === 200 && event.request.method === 'GET') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        },
        () => (path === '/index.html' || path === '/' ? caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 })) : new Response('Offline', { status: 503 }))
      );
    })
  );
});
