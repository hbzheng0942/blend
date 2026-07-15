/** Blend 公共 Agnes 通道：最小权限反代 + 匿名用户防滥用。 */

const UPSTREAM = "https://apihub.agnes-ai.com";
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const DEFAULT_ORIGINS = new Set([
  "https://blend-bnf.pages.dev",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:19006",
]);
const IMAGE_MODELS = new Set(["agnes-image-2.0-flash", "agnes-image-2.1-flash"]);
const IMAGE_SIZES = new Set(["1K", "1024x1024"]);
const IMAGE_RATIOS = new Set(["1:1"]);
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,/;

function json(message, status, cors = {}, diagnostic = {}) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...cors,
      ...diagnostic,
    },
  });
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length ? new Set(configured) : DEFAULT_ORIGINS;
}

function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "Retry-After, X-Blend-Failure-Origin, X-Blend-Upstream-Status",
    Vary: "Origin",
  };
}

async function readJson(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
    throw new RequestError("content-type must be application/json", 415);
  }
  const advertised = Number(request.headers.get("Content-Length") || 0);
  if (advertised > MAX_BODY_BYTES) throw new RequestError("request body too large", 413);
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw new RequestError("request body too large", 413);
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new RequestError("invalid JSON", 400);
  }
}

function assertText(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new RequestError(`${name} is invalid`, 400);
  }
  return value;
}

function sanitizeDataImages(images) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 6) throw new RequestError("at most 6 input images", 400);
  return images.map((image) => {
    if (typeof image !== "string" || image.length > 4 * 1024 * 1024 || !DATA_IMAGE.test(image)) {
      throw new RequestError("only png/jpeg/webp data images are allowed", 400);
    }
    return image;
  });
}

function sanitizeImageRequest(body) {
  if (!body || typeof body !== "object" || !IMAGE_MODELS.has(body.model)) {
    throw new RequestError("image model not allowed", 400);
  }
  const prompt = assertText(body.prompt, "prompt", 12_000);
  const images = sanitizeDataImages(body.extra_body?.image);
  if (!IMAGE_SIZES.has(body.size)) throw new RequestError("image size not allowed", 400);
  if (body.ratio !== undefined && !IMAGE_RATIOS.has(body.ratio)) throw new RequestError("image ratio not allowed", 400);
  if (body.seed !== undefined && (!Number.isSafeInteger(body.seed) || body.seed < 0)) throw new RequestError("seed is invalid", 400);
  return {
    model: body.model,
    prompt,
    extra_body: { response_format: "b64_json", ...(images.length ? { image: images } : {}) },
    size: body.size,
    ...(body.ratio ? { ratio: body.ratio } : {}),
    ...(body.seed !== undefined ? { seed: body.seed } : {}),
  };
}

function sanitizeChatRequest(body) {
  if (!body || typeof body !== "object" || body.model !== "agnes-2.0-flash") {
    throw new RequestError("chat model not allowed", 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length !== 2) throw new RequestError("messages are invalid", 400);
  const [system, user] = body.messages;
  if (system?.role !== "system" || user?.role !== "user" || !Array.isArray(user.content)) {
    throw new RequestError("messages are invalid", 400);
  }
  const systemText = assertText(system.content, "system message", 12_000);
  if (user.content.length < 1 || user.content.length > 7) throw new RequestError("user content is invalid", 400);
  const content = user.content.map((part, index) => {
    if (index === 0 && part?.type === "text") return { type: "text", text: assertText(part.text, "user text", 8_000) };
    if (part?.type !== "image_url") throw new RequestError("user content is invalid", 400);
    const [url] = sanitizeDataImages([part.image_url?.url]);
    return { type: "image_url", image_url: { url } };
  });
  const temperature = Number(body.temperature);
  const maxTokens = Number(body.max_tokens);
  if (!Number.isFinite(temperature) || temperature < 0.2 || temperature > 0.7) throw new RequestError("temperature is invalid", 400);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000) throw new RequestError("max_tokens is invalid", 400);
  if (body.enable_thinking !== undefined && body.enable_thinking !== false) {
    throw new RequestError("thinking must be disabled", 400);
  }
  if (body.response_format?.type !== "json_object") {
    throw new RequestError("response format must be json_object", 400);
  }
  return {
    model: "agnes-2.0-flash",
    temperature,
    max_tokens: maxTokens,
    ...(body.enable_thinking === false ? { enable_thinking: false } : {}),
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: systemText }, { role: "user", content }],
  };
}

class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function enforceLimit(env, request, pathname) {
  const limiter = pathname === "/v1/images/generations" ? env.IMAGE_RATE_LIMITER : env.GENERAL_RATE_LIMITER;
  if (!limiter?.limit) throw new RequestError("rate limiter is not configured", 503);
  const actor = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await limiter.limit({ key: `${actor}:${pathname}` });
  if (!success) throw new RequestError("public furnace rate limit exceeded", 429);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsFor(request, env);

    if (request.method === "OPTIONS") {
      return cors ? new Response(null, { status: 204, headers: cors }) : json("origin not allowed", 403);
    }
    if (request.headers.has("Origin") && !cors) return json("origin not allowed", 403);

    const route = `${request.method} ${url.pathname}`;
    if (route === "GET /health") {
      const bindings = {
        upstream: Boolean(env.AGNES_API_KEY),
        imageRateLimiter: typeof env.IMAGE_RATE_LIMITER?.limit === "function",
        generalRateLimiter: typeof env.GENERAL_RATE_LIMITER?.limit === "function",
      };
      return new Response(JSON.stringify({ ok: Object.values(bindings).every(Boolean), bindings }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(cors || {}) },
      });
    }
    if (!["POST /v1/images/generations", "POST /v1/chat/completions", "GET /v1/models"].includes(route)) {
      return json("endpoint not allowed", 403, cors || {});
    }
    if (request.method === "POST" && !cors) return json("browser origin required", 403);

    try {
      await enforceLimit(env, request, url.pathname);
      if (!env.AGNES_API_KEY) throw new RequestError("upstream is not configured", 503);
      let body;
      if (request.method === "POST") {
        const parsed = await readJson(request);
        body = url.pathname === "/v1/images/generations"
          ? sanitizeImageRequest(parsed)
          : sanitizeChatRequest(parsed);
      }

      const upstream = await fetch(UPSTREAM + url.pathname, {
        method: request.method,
        headers: {
          Authorization: "Bearer " + env.AGNES_API_KEY,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const headers = new Headers(upstream.headers);
      for (const [key, value] of Object.entries(cors || {})) headers.set(key, value);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Blend-Upstream-Status", String(upstream.status));
      if (!upstream.ok) headers.set("X-Blend-Failure-Origin", "upstream");
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      const headers = { ...(cors || {}), ...(status === 429 ? { "Retry-After": "60" } : {}) };
      return json(
        error instanceof RequestError ? error.message : "proxy error",
        status,
        headers,
        { "X-Blend-Failure-Origin": "worker" },
      );
    }
  },
};
