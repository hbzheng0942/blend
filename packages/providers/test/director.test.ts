import { describe, expect, it, vi } from "vitest";
import { createAgnesDirector } from "../src";

const CONCEPTS = {
  concepts: [
    {
      name: "Ceramic Cephalopod",
      prompt:
        "A surreal teapot formed by a bulbous cephalopod mantle glazed in porcelain, tentacle " +
        "spouts with suction cups, soft studio light, neutral minimalist backdrop.",
    },
    {
      name: "Abyssal Vessel",
      prompt:
        "A deep-sea creature head shaped teapot in glossy crackled blue-grey glaze, translucent " +
        "tentacle grip, delicate beak spouts, clean shadowless grey background.",
    },
  ],
};

const chatResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("agnes director", () => {
  it("组装 chat 请求：system+user 多模态消息，走 /v1/chat/completions", async () => {
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://apihub.agnes-ai.com/v1/chat/completions");
      const body = JSON.parse(init!.body as string);
      expect(body.model).toBe("agnes-2.0-flash");
      expect(body.enable_thinking).toBe(false);
      expect(body.temperature).toBe(0.35);
      expect(body.max_tokens).toBe(650);
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].role).toBe("system");
      const content = body.messages[1].content;
      expect(content[0].type).toBe("text");
      expect(content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,xx" } });
      return chatResponse(JSON.stringify(CONCEPTS));
    });
    const d = createAgnesDirector({ apiKey: "k", fetchImpl: f as typeof fetch });
    const r = await d.direct({
      operator: "fuse",
      images: ["data:image/png;base64,xx"],
      styleFragments: [],
      count: 2,
    });
    expect(r).toHaveLength(2);
    expect(r![0]!.name).toBe("Ceramic Cephalopod");
  });

  it("HTTP 持续失败补一次重试后放弃 → null（静默回退）", async () => {
    const f = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    const d = createAgnesDirector({ apiKey: "k", fetchImpl: f as typeof fetch });
    const r = await d.direct({ operator: "fuse", images: [], styleFragments: [], count: 2 });
    expect(r).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("HTTP 200 但正文非法 → 立即降级，不重复烧请求", async () => {
    const f = vi.fn().mockResolvedValue(chatResponse("I cannot help with that."));
    const d = createAgnesDirector({ apiKey: "k", fetchImpl: f as typeof fetch });
    const r = await d.direct({ operator: "absorb", images: [], styleFragments: [], count: 2 });
    expect(r).toBeNull();
    expect(f).toHaveBeenCalledOnce();
  });

  it("详细结果区分限流与格式异常，避免 UI 全部误报离线", async () => {
    const limitedFetch = vi.fn().mockResolvedValue(new Response("busy", { status: 429 }));
    const limited = createAgnesDirector({ apiKey: "k", fetchImpl: limitedFetch });
    expect(await limited.directDetailed({ operator: "fuse", images: [], styleFragments: [], count: 1 }))
      .toEqual({ concepts: null, issue: "rate-limit" });

    const malformed = createAgnesDirector({ apiKey: "k", fetchImpl: vi.fn().mockResolvedValue(chatResponse("not-json")) });
    expect(await malformed.directDetailed({ operator: "fuse", images: [], styleFragments: [], count: 1 }))
      .toEqual({ concepts: null, issue: "invalid-response" });
  }, 10_000);

  it("自定义 baseUrl（内置 Worker 通道）", async () => {
    const f = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("https://proxy.example.com/v1/chat/completions");
      return chatResponse(JSON.stringify(CONCEPTS));
    });
    const d = createAgnesDirector({
      apiKey: "builtin",
      baseUrl: "https://proxy.example.com/",
      fetchImpl: f as typeof fetch,
    });
    await d.direct({ operator: "inject", images: [], styleFragments: [], count: 1 });
    expect(f).toHaveBeenCalledOnce();
  });

  it("兼容上游把普通草稿错放到 reasoning_content", async () => {
    const reasoning = `Concept 1\nName: 冰封日珥\nEquation: 日火 × 月壳 → 冻结风暴\nPrompt: A blazing solar storm frozen inside a porous lunar crescent shell, cold blue mineral crust against an orange plasma core.`;
    const f = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "", reasoning_content: reasoning } }],
    }), { status: 200 }));
    const d = createAgnesDirector({ apiKey: "k", fetchImpl: f as typeof fetch });
    const result = await d.direct({ operator: "fuse", images: [], styleFragments: [], count: 2 });
    expect(result).toEqual([{
      name: "冰封日珥",
      equation: "日火 × 月壳 → 冻结风暴",
      prompt: "A blazing solar storm frozen inside a porous lunar crescent shell, cold blue mineral crust against an orange plasma core.",
    }]);
    expect(f).toHaveBeenCalledOnce();
  });
});
