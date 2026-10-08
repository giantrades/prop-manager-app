/* FinanceOS service worker — PWA MOBILE SPEC (Stage 3, T3.9).
 *
 * Estratégia de cache POR ROTA (05-PWA_MOBILE_SPEC.md), não só "não cachear POST":
 *   - App shell (JS/CSS/HTML/fontes/imagens do build): cache-first, atualiza em background.
 *   - GET de leitura de dado (accounts, trades, positions): stale-while-revalidate
 *     (mostra cache instantâneo, atualiza assim que a rede responder — sustenta o banner STALE/OFFLINE).
 *   - GET /status, /health do bridge: NETWORK-ONLY com timeout curto (3s).
 *     Esse dado nunca pode fingir estar fresco — é o que decide se o resto é STALE.
 *   - POST/PUT/DELETE: NUNCA cacheado, nunca servido do cache. Se offline, entra na
 *     fila `sync_queue` (IndexedDB) e retorna {queued:true} — NUNCA finge sucesso.
 *   - Imagens/anexos de comprovante: cache-first com expiração longa (30 dias).
 *   - pushManager registrado vazio (para não exigir reinstall quando push chegar).
 */
// v5: purga o cache v4 (que podia conter index.html/chunks velhos servidos como JS).
const CACHE = "financeos-shell-v5";
const CACHE_ASSETS = "financeos-assets-v5";
const CACHE_ATTACHMENTS = "financeos-attachments-v5";
const DATA_READ_HINTS = ["/api/", "/accounts", "/trades", "/positions"];
const BRIDGE_STATUS_PATHS = ["/status", "/health"];
const ATTACHMENT_RE = /\.(png|jpe?g|gif|webp|pdf|svg)$/i;
const SW_TIMEOUT_MS = 3000;

// ── sync_queue (IndexedDB) ──────────────────────────────────────────────────
const QUEUE_DB = "financeos-queue";
const QUEUE_STORE = "sync_queue";

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(QUEUE_STORE)) {
        req.result.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueWrite(payload) {
  const db = await openQueueDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).put({
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: payload.url,
    method: payload.method,
    headers: payload.headers || {},
    body: payload.body || null,
    queuedAt: new Date().toISOString(),
  });
  await new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
}

async function readQueue() {
  const db = await openQueueDb();
  const tx = db.transaction(QUEUE_STORE, "readonly");
  const req = tx.objectStore(QUEUE_STORE).getAll();
  return new Promise((resolve) => { req.onsuccess = () => resolve(req.result || []); req.onerror = () => resolve([]); });
}

async function deleteQueued(id) {
  const db = await openQueueDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).delete(id);
  await new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
}

async function replayQueue() {
  const queue = await readQueue();
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (res.ok) await deleteQueued(item.id);
    } catch {
      // bridge ainda offline — mantém na fila
    }
  }
}

// ── Install / Activate ──────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/"])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![CACHE, CACHE_ASSETS, CACHE_ATTACHMENTS].includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Helpers ────────────────────────────────────────────────────────────────
function isCrossOrigin(url) {
  return url.origin !== self.location.origin;
}

function isBridgeStatus(url) {
  return BRIDGE_STATUS_PATHS.some((p) => url.pathname.endsWith(p));
}

function isDataRead(url) {
  return DATA_READ_HINTS.some((p) => url.pathname.includes(p));
}

// NÃO interceptamos mais /assets/* aqui: os chunks têm hash e cache imutável no CDN, então
// o próprio navegador (HTTP cache) cuida. Interceptar causava os avisos de "preload …
// cross-world service worker mismatch" e, pior, cacheava o index.html (SPA fallback) como
// se fosse o .js quando um chunk antigo faltava → "MIME text/html" e erro de módulo.

async function networkOnlyWithTimeout(request, timeoutMs = SW_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } catch (e) {
    // NUNCA rejeitar: respondWith exige uma Response. Bridge offline/timeout => 503 honesto.
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: e && e.name === "AbortError" ? "timeout" : "bridge_offline",
          message: "Sem conexão — bridge offline",
          retryable: true,
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    clearTimeout(timer);
  }
}

// Só memoriza resposta BOA (2xx, mesmo domínio). Nunca cacheia 404/erro/redirect —
// era isso que "prendia" um chunk velho/erro e quebrava os imports dinâmicos.
function putIfOk(cacheName, request, res) {
  if (!res || !res.ok) return res;
  const copy = res.clone();
  caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {});
  return res;
}

// stale-while-revalidate
function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((res) => putIfOk(CACHE, request, res))
      .catch(() => cached);
    // `cached` é uma Response (não Promise): nunca chamar .then nela.
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    return network.then((res) => res || new Response("", { status: 504, statusText: "Offline" }));
  });
}

// ── Fetch handler ───────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Só intercepta o MESMO domínio (app shell + anexos). Requisições a outras origens
  // (Supabase, bridge 127.0.0.1, calendário) passam DIRETO ao navegador — evita cache
  // indevido de API e os erros "promise was rejected" do SW.
  if (url.origin !== self.location.origin) return;

  // Writes (POST/PUT/DELETE) — NUNCA cacheadas.
  if (request.method !== "GET") {
    event.respondWith(
      fetch(request).catch(async () => {
        // Offline / bridge off: enfileira e retorna resposta HONESTA (não sucesso).
        const payload = await request.clone().text().catch(() => null);
        await queueWrite({
          id: request.headers.get("X-Client-Order-Id") || undefined,
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: payload,
        });
        return new Response(
          JSON.stringify({
            success: false,
            queued: true,
            error: { code: "bridge_offline", message: "Sem conexão — operação na fila", retryable: true },
          }),
          {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // Bridge /status e /health: network-only, timeout curto.
  if (isBridgeStatus(url)) {
    event.respondWith(networkOnlyWithTimeout(request));
    return;
  }

  // Navegação: network-first, fallback cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => putIfOk(CACHE, "/index.html", res))
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Anexos/imagens de comprovante: cache-first expiração longa.
  if (ATTACHMENT_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => putIfOk(CACHE_ATTACHMENTS, request, res))
      )
    );
    return;
  }

  // GET de leitura de dado (mesmo domínio): stale-while-revalidate.
  if (isDataRead(url) && !isCrossOrigin(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // GETs restantes: network-only.
});

// ── Background sync / online replay ────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "financeos-sync") {
    event.waitUntil(replayQueue());
  }
});

self.addEventListener("online", () => {
  replayQueue();
});

// ── Push (P2) ───────────────────────────────────────────────────────────────
// Payload esperado do sender: { title, body, url }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "FinanceOS";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
