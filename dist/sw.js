// Sempre consulta a versão publicada; não mantém cópias antigas do site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(self.registration.scope.replace(url.origin, ''))) return;
  if (event.request.mode === 'navigate' || /\.(js|css)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
  }
});
