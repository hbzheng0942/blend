import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./agnes-proxy.js";

const allow = { limit: vi.fn(async () => ({ success: true })) };
const env = { AGNES_API_KEY: "secret", IMAGE_RATE_LIMITER: allow, GENERAL_RATE_LIMITER: allow };
const origin = "https://blend-bnf.pages.dev";

function imageBody(overrides = {}) {
  return {
    model: "agnes-image-2.1-flash",
    prompt: "blend two things",
    size: "1K",
    ratio: "1:1",
    extra_body: { response_format: "b64_json", image: ["data:image/png;base64,eA=="] },
    ...overrides,
  };
}

function chatBody(overrides = {}) {
  return {
    model: "agnes-2.0-flash",
    temperature: 0.35,
    enable_thinking: false,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return strict JSON concepts." },
      { role: "user", content: [{ type: "text", text: "Fuse the inputs." }] },
    ],
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("agnes proxy guard", () => {
  it("exposes binding health without leaking the secret", async () => {
    const response = await worker.fetch(new Request("https://worker/health", { headers: { Origin: origin } }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      bindings: { upstream: true, imageRateLimiter: true, generalRateLimiter: true },
    });
  });

  it("rejects unknown origins before calling upstream", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await worker.fetch(new Request("https://worker/v1/images/generations", {
      method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify(imageBody()),
    }), env);
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed without a rate limiter binding", async () => {
    const response = await worker.fetch(new Request("https://worker/v1/images/generations", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(imageBody()),
    }), { AGNES_API_KEY: "secret" });
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Blend-Failure-Origin")).toBe("worker");
  });

  it("fails closed without the upstream secret", async () => {
    const response = await worker.fetch(new Request("https://worker/v1/models", {
      headers: { Origin: origin },
    }), { IMAGE_RATE_LIMITER: allow, GENERAL_RATE_LIMITER: allow });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { message: "upstream is not configured" } });
  });

  it("rejects model escalation and excess images", async () => {
    const badModel = await worker.fetch(new Request("https://worker/v1/images/generations", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(imageBody({ model: "expensive-model" })),
    }), env);
    expect(badModel.status).toBe(400);

    const tooMany = imageBody();
    tooMany.extra_body.image = Array(7).fill("data:image/png;base64,eA==");
    const response = await worker.fetch(new Request("https://worker/v1/images/generations", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(tooMany),
    }), env);
    expect(response.status).toBe(400);
  });

  it("rebuilds an allowed request and never forwards client authorization", async () => {
    const fetchSpy = vi.fn(async (_url, init) => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const response = await worker.fetch(new Request("https://worker/v1/images/generations", {
      method: "POST",
      headers: { Origin: origin, Authorization: "Bearer attacker", "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: JSON.stringify({ ...imageBody(), unexpected: "drop-me" }),
    }), env);
    expect(response.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).not.toHaveProperty("unexpected");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("X-Blend-Upstream-Status")).toBe("200");
  });

  it("returns 429 with retry guidance", async () => {
    const denied = { limit: vi.fn(async () => ({ success: false })) };
    const response = await worker.fetch(new Request("https://worker/v1/models", { headers: { Origin: origin } }), {
      ...env, GENERAL_RATE_LIMITER: denied,
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("forwards only disabled thinking and caps completion budget", async () => {
    const fetchSpy = vi.fn(async (_url, init) => new Response(init.body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const accepted = await worker.fetch(new Request("https://worker/v1/chat/completions", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(chatBody()),
    }), env);
    expect(accepted.status).toBe(200);
    const forwarded = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(forwarded.model).toBe("agnes-2.0-flash");
    expect(forwarded.enable_thinking).toBe(false);
    expect(forwarded.temperature).toBe(0.35);
    expect(forwarded.max_tokens).toBe(800);
    expect(forwarded.response_format).toEqual({ type: "json_object" });

    const rejected = await worker.fetch(new Request("https://worker/v1/chat/completions", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(chatBody({ enable_thinking: true })),
    }), env);
    expect(rejected.status).toBe(400);
  });
});
