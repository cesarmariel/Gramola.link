// Service worker de la web del micro (PWA). Red primero; si no hay red, lo último guardado.
// Así la app abre al instante desde la pantalla de inicio y muestra «Reconectando…» sin red.
const CACHE = 'gramola-micro-v12';
const SHELL = [
  '/', '/m.css', '/m.js', '/despierto.mp4', '/js/net.js', '/js/pitch.js', '/js/wake.js', '/vendor/jsQR.js',
  '/assets/logo/horizontal-claro.png', '/assets/nuvola/tinta.png',
  '/assets/micro/j1.webp', '/assets/micro/j2.webp', '/assets/micro/j3.webp', '/assets/micro/j4.webp',
  '/assets/micro/j5.webp', '/assets/micro/j6.webp', '/assets/micro/j7.webp', '/assets/micro/j8.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/ws') || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
