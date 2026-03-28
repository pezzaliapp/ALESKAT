// ─── ALESKAT Service Worker — auto-update ─────────────────────────────────────
// BUILD_TS viene sostituito automaticamente dal workflow GitHub Actions con il
// timestamp Unix del deploy. Se non usi Actions, cambia questo numero ad ogni
// release manualmente (es. 20260328_01 → 20260328_02).
const BUILD_TS = '__BUILD_TS__';
const CACHE    = `aleskat-${BUILD_TS}`;

// File dell'app (network-first: si aggiornano ad ogni deploy)
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

// Asset statici pesanti (cache-first: cambiano raramente)
const STATIC_FILES = [
  './icon-192.png',
  './icon-512.png',
];

// ─── INSTALL: precache tutto ───────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([...APP_FILES, ...STATIC_FILES]))
      .then(() => self.skipWaiting())  // attiva subito senza aspettare tab chiuse
  );
});

// ─── ACTIVATE: elimina cache vecchie ──────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // prende controllo di tutti i tab aperti
      .then(() => notifyClients('updated'))
  );
});

// ─── FETCH: network-first per i file app, cache-first per gli statici ─────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Solo richieste same-origin
  if (url.origin !== location.origin) return;

  const isStatic = STATIC_FILES.some(f => url.pathname.endsWith(f.replace('./','')));

  if (isStatic) {
    // Cache-first per icone
    e.respondWith(
      caches.match(e.request)
        .then(r => r || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        }))
        .catch(() => caches.match('./index.html'))
    );
  } else {
    // Network-first per tutto il codice
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Aggiorna cache con la risposta fresca
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() =>
          // Offline fallback dalla cache
          caches.match(e.request)
            .then(r => r || caches.match('./index.html'))
        )
    );
  }
});

// ─── Notifica tutti i client aperti ───────────────────────────────────────────
function notifyClients(type) {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => clients.forEach(c => c.postMessage({ type: `aleskat:${type}` })));
}

