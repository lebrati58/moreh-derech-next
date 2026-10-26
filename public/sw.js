// Hors-ligne : les pages et leurs fichiers sont servis depuis le cache si le réseau tombe.
// Stratégie "réseau d'abord" : toujours la dernière version quand le réseau est là.
// Pages, scripts, styles et données sont REVALIDÉS auprès du serveur (cache: 'no-cache') : jamais
// d'ancienne version tant que le réseau répond. Les appels à Supabase (POST, autre domaine) ne
// passent jamais par ce cache.
const CACHE = 'mdl-next-v20-map3d';
const FILES = ['./', './index.html', './assets/moreh-derech-next-driver.webp', './next-theme.css', './modes.html', './play.html', './anecdotes.html', './anecdotes.json', './guided-tour.html', './guided-quiz.json', './map.html', './places.json', './tour-data.js', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/leaflet.markercluster.js', './vendor/leaflet/MarkerCluster.css', './siyurim-catalog.json', './tour-catalog.html', './tour-catalog.json', './admin.html', './style.css', './api.js', './config.js', './feedback.js', './progress.js', './class.html', './journey.html', './jerusalem3d.html', './jerusalem3d/app.js', './jerusalem3d/monuments.json', './jerusalem3d/geo.json', './vendor/three/three.module.min.js', './jerusalem3d/models.js', './vendor/three/jsm/loaders/GLTFLoader.js', './vendor/three/jsm/libs/meshopt_decoder.module.js', './jerusalem3d/models/temple-mount-30ce.json', './jerusalem3d/materials.js', './vendor/three/jsm/controls/OrbitControls.js', './vendor/three/jsm/utils/BufferGeometryUtils.js', './vendor/three/jsm/objects/Sky.js', './vendor/three/jsm/postprocessing/EffectComposer.js', './vendor/three/jsm/shaders/CopyShader.js', './vendor/three/jsm/postprocessing/ShaderPass.js', './vendor/three/jsm/postprocessing/Pass.js', './vendor/three/jsm/postprocessing/MaskPass.js', './vendor/three/jsm/postprocessing/RenderPass.js', './vendor/three/jsm/postprocessing/GTAOPass.js', './vendor/three/jsm/shaders/GTAOShader.js', './vendor/three/jsm/shaders/PoissonDenoiseShader.js', './vendor/three/jsm/math/SimplexNoise.js', './vendor/three/jsm/postprocessing/OutputPass.js', './vendor/three/jsm/shaders/OutputShader.js', './vendor/three/jsm/postprocessing/SMAAPass.js', './vendor/three/jsm/shaders/SMAAShader.js',
  './gps-engine.js', './auto-engine.js', './community.html', './community-library.html', './community.js', './contribute.html', './community-document.html', './create.html', './solo.html', './doc-reader.js', './admin-nav.js', './vendor/qrcode.js', './v3/road67-route.json', './site3d.html', './sites3d/app.js', './sites3d/models.js'];

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
