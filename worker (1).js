/**
 * CPWhat's up — Cloudflare Worker (proxy seguro para a Anthropic API)
 * ------------------------------------------------------------------
 * Guarda a sua API key do Claude em variável secreta do Worker e
 * encaminha as chamadas do seu front-end para api.anthropic.com.
 *
 * DEPLOY:
 * 1. Crie o Worker em https://dash.cloudflare.com → Workers & Pages → Create
 * 2. Cole este arquivo em `src/index.js` (ou no editor online do Worker)
 * 3. Vá em Settings → Variables and Secrets → Add variable (tipo Secret)
 *      Nome:  ANTHROPIC_API_KEY
 *      Valor: sk-ant-...  (sua chave em console.anthropic.com)
 * 4. Ajuste ALLOWED_ORIGINS abaixo para os domínios que podem chamar este Worker.
 * 5. Publique (Deploy) e copie a URL final (ex: https://cpwhatsup.SEU-USER.workers.dev)
 * 6. No index.html, troque:
 *       const SUMMARY_API_URL = "https://SEU-WORKER.SEU-USUARIO.workers.dev/";
 *    pela URL real do Worker.
 */

// ── Domínios autorizados a chamar este Worker ──
// Em produção, NUNCA use "*" — alguém vai descobrir a URL e queimar sua cota.
const ALLOWED_ORIGINS = [
  "https://antoneli1982.github.io",
  "http://localhost:5500",   // live-server local
  "http://localhost:8000",   // python -m http.server
  "http://127.0.0.1:5500",
];

// ── Rate limit simples por IP (protege contra flood) ──
// Usa o KV cache nativo do Worker — sem setup adicional.
const RATE_LIMIT_PER_MINUTE = 20;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, cors);
    }

    // Checa se a origem é autorizada
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }

    // Checa a chave
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server misconfigured: ANTHROPIC_API_KEY secret is missing" }, 500, cors);
    }

    // Rate limit rudimentar por IP
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ok = await checkRateLimit(ip, RATE_LIMIT_PER_MINUTE);
    if (!ok) {
      return json({ error: "Rate limit exceeded — tente de novo em 1 minuto" }, 429, cors);
    }

    // Valida o body
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, cors);
    }

    // Sanidade: limita tamanho do prompt pra não torrar conta se alguém abusar
    const approxSize = JSON.stringify(body).length;
    if (approxSize > 150_000) {
      return json({ error: "Payload too large" }, 413, cors);
    }

    // Força limites seguros de max_tokens
    if (!body.max_tokens || body.max_tokens > 4000) body.max_tokens = 1500;

    // Encaminha para a Anthropic
    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...cors,
          "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        },
      });
    } catch (err) {
      return json({ error: "Upstream fetch failed", detail: String(err) }, 502, cors);
    }
  },
};

// ── Helpers ──

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Rate limit em memória do Worker (reinicia com o isolado — suficiente pra abuso trivial).
// Pra rate limit sério, use Cloudflare Durable Objects ou KV.
const rateStore = new Map();
async function checkRateLimit(key, perMinute) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (rateStore.get(key) || []).filter(t => t > windowStart);
  arr.push(now);
  rateStore.set(key, arr);
  // Limpeza oportunística
  if (rateStore.size > 5000) {
    for (const [k, v] of rateStore) {
      if (!v.length || v[v.length - 1] < windowStart) rateStore.delete(k);
    }
  }
  return arr.length <= perMinute;
}
