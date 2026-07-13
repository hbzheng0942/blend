import { describe, expect, it, vi } from "vitest";
import { createAgnesProvider, FurnaceOverheatError } from "../src";

const okResponse = (b64 = "AAAA") =>
  new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 });

const queueFullResponse = () =>
  new Response(
    JSON.stringify({ error: { message: "image queue is full, please retry later", code: "do_request_failed" } }),
    { status: 503 },
  );

function provider(fetchImpl: typeof fetch) {
  return createAgnesProvider({ apiKey: "k", fetchImpl });
}

describe("agnes provider", () => {
  it("成功：b64_json → data URI，请求体符合 spike 验证的契约", async () => {
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://apihub.agnes-ai.com/v1/images/generations");
      const body = JSON.parse(init!.body as string);
      expect(body.model).toBe("agnes-image-2.0-flash");
      expect(body.size).toBe("1024x1024");
      expect(body.extra_body.response_format).toBe("b64_json");
      expect(body.extra_body.image).toEqual(["data:image/png;base64,xx"]);
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer k");
      return okResponse();
    });
    const r = await provider(f as typeof fetch).generate({
      prompt: "p",
      images: ["data:image/png;base64,xx"],
    });
    expect(r.image).toBe("data:image/png;base64,AAAA");
  });

  it("2.1 模型使用 size=1K + ratio", async () => {
    const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.size).toBe("1K");
      expect(body.ratio).toBe("1:1");
      return okResponse();
    });
    await createAgnesProvider({
      apiKey: "k",
      modelId: "agnes-image-2.1-flash",
      fetchImpl: f as typeof fetch,
    }).generate({ prompt: "p", images: [] });
  });

  it("503 queue-full 重试后成功", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const f = vi.fn(async () => (++n === 1 ? queueFullResponse() : okResponse()));
      const p = provider(f as typeof fetch).generate({ prompt: "p", images: [] });
      await vi.runAllTimersAsync();
      const r = await p;
      expect(r.image).toContain("data:");
      expect(f).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("持续 queue-full → FurnaceOverheatError", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn(async () => queueFullResponse());
      const p = provider(f as typeof fetch)
        .generate({ prompt: "p", images: [] })
        .catch((e) => e);
      await vi.runAllTimersAsync();
      const e = await p;
      expect(e).toBeInstanceOf(FurnaceOverheatError);
      expect(f).toHaveBeenCalledTimes(4); // 1 + 3 次重试
    } finally {
      vi.useRealTimers();
    }
  });

  it("400 不重试直接抛", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "too many input images" } }), { status: 400 }),
    );
    await expect(
      provider(f as typeof fetch).generate({ prompt: "p", images: [] }),
    ).rejects.toThrow(/400/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("超过 maxInputImages 本地直接拒绝", async () => {
    const f = vi.fn();
    await expect(
      provider(f as unknown as typeof fetch).generate({
        prompt: "p",
        images: Array(7).fill("data:x"),
      }),
    ).rejects.toThrow(/too many/);
    expect(f).not.toHaveBeenCalled();
  });

  it("capabilities 与 spike 实测一致（subtract/intersect 经 director 翻案解禁）", () => {
    const p = provider(fetch);
    expect(p.capabilities.maxInputImages).toBe(6);
    expect(p.capabilities.supportedOperators).toEqual([
      "fuse", "inject", "absorb", "subtract", "intersect",
    ]);
  });
});
