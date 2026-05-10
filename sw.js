// Service Worker do Transcriação
// Estratégia: network-first com fallback para cache (offline)
// Versão: incrementar quando publicar nova versão pra invalidar cache

const CACHE_VERSION = "transcriacao-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Não falhar se algum item não puder ser cacheado (ex: 404 antes do deploy)
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => null))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Não cachear requisições para Deepgram, Hugging Face, fontes (deixa ir direto pra rede)
  const url = new URL(req.url);
  const skipCache = (
    url.hostname.includes("deepgram.com") ||
    url.hostname.includes("huggingface.co") ||
    url.hostname.includes("hf.co") ||
    url.hostname.includes("jsdelivr.net") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  );

  if (skipCache) return;  // browser handles normally

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Atualiza o cache em segundo plano com a resposta nova
        if (res && res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => {
        // Sem rede: serve do cache
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          // Fallback: serve a página principal pra navegação offline
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
      })
  );
});
