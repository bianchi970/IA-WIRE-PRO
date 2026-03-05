/* IA Wire Pro — Service Worker PWA
   Network-first per asset statici (evita cache stale), network-only per API.
   Versione del cache: aggiornare CACHE_VERSION ad ogni deploy.
*/
var CACHE_NAME = "iawire-v2";
var STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json"
];

/* ===== INSTALL: precache degli asset statici ===== */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ===== ACTIVATE: elimina cache vecchie ===== */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ===== FETCH: strategia ibrida ===== */
self.addEventListener("fetch", function (event) {
  var url = event.request.url;

  /* API calls: sempre network, mai cache */
  if (url.indexOf("/api/") >= 0 || url.indexOf("/health") >= 0) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* Asset statici: network-first, poi cache (evita JS/CSS stale) */
  event.respondWith(
    fetch(event.request).then(function (response) {
      /* Salva in cache solo risposte valide per fallback offline */
      if (response && response.status === 200 && response.type === "basic") {
        var cloned = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, cloned);
        });
      }
      return response;
    }).catch(function () {
      /* Offline: usa cache se disponibile */
      return caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        /* Fallback navigazione → index.html */
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});
