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

  it("HTTP 失败重试一次后放弃 → null（静默回退）", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response("boom", { status: 503 }));
    const d = createAgnesDirector({ apiKey: "k", fetchImpl: f as typeof fetch });
    const r = await d.direct({ operator: "fuse", images: [], styleFragments: [], count: 2 });
    expect(r).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("回复不是合法 JSON → 重试，第二次成功", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("I cannot help with that."))
      .mockResolvedValueOnce(chatResponse("```json\n" + JSON.stringify(CONCEPTS) + "\n```"));
    const d = createAgnesDirector({ apiKey: "k", fetchImpl: f as typeof fetch });
    const r = await d.direct({ operator: "absorb", images: [], styleFragments: [], count: 2 });
    expect(r).toHaveLength(2);
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
});
