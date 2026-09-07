/* FinanceOS app-shell service worker (Stage 0 — S0.4).
 * Estratégia: cache SÓ do app shell (mesma origem, GET).
 * - Navegações: network-first com fallback para o cache (abre offline).
 * - Assets estáticos mesma-origem (JS/CSS/fontes/imagens): cache-first.
 * - Tudo o mais (POST/PUT/DELETE, cross-origin, bridge, APIs): network-only,
 *   NUNCA cacheado. Escrita offline entra na sync_queue (Stage 2+), nunca
 *   finge sucesso aqui.
 * Escopo: / (main-app). O journal tem o seu próprio sw em /journal/sw.js.
 */
const CACHE = "financeos-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/favicon32x32.png")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca cachear escrita
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // bridge/APIs: network-only

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
  }
  // GETs mesma-origem fora do shell: network-only (dado nunca fingido fresco).
});
