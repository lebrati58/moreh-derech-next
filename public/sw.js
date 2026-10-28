// Hors-ligne : les pages et leurs fichiers sont servis depuis le cache si le réseau tombe.
// Stratégie "réseau d'abord" : toujours la dernière version quand le réseau est là.
// Pages, scripts, styles et données sont REVALIDÉS auprès du serveur (cache: 'no-cache') : jamais
// d'ancienne version tant que le réseau répond. Les appels à Supabase (POST, autre domaine) ne
// passent jamais par ce cache.
const CACHE = 'mdl-next-v32-musee';
  './gps-engine.js', './auto-engine.js', './community.html', './community-library.html', './community.js', './contribute.html', './community-document.html', './create.html', './solo.html', './doc-reader.js', './admin-nav.js', './vendor/qrcode.js', './v3/road67-route.json', './era-timeline.js', './site3d.html', './sites3d/app.js', './sites3d/models.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const fresh = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  e.respondWith(
    fetch(fresh ? new Request(req, { cache: 'no-cache' }) : req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
