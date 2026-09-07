/* FinanceOS Journal app-shell service worker (Stage 0 — S0.4).
 * Mesma estratégia do main-app, escopo /journal/.
 * - Navegações: network-first com fallback para o cache (abre offline).
 * - Assets estáticos mesma-origem sob /journal/: cache-first.
 * - POST/PUT/DELETE, cross-origin, bridge, APIs: network-only, NUNCA cacheado.
 */
const CACHE = "financeos-journal-shell-v1";
const INDEX = "/journal/index.html";

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
    url.pathname.startsWith("/journal/") &&
    (url.pathname.startsWith("/journal/assets/") ||
      url.pathname.startsWith("/journal/icons/") ||
      url.pathname === "/journal/manifest.webmanifest" ||
      url.pathname === "/journal/favicon32x32.png")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca cachear escrita
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // bridge/APIs: network-only
  if (!url.pathname.startsWith("/journal/")) return; // fora do escopo: ignora

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(INDEX, copy));
          return res;
        })
        .catch(() => caches.match(INDEX))
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
});
