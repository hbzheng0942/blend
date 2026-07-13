import { describe, expect, it, vi } from "vitest";
import { FurnaceOverheatError, createGeminiProvider } from "../src";

const okResponse = () =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "sure" }, { inlineData: { mimeType: "image/png", data: "AAAA" } }] } },
      ],
    }),
    { status: 200 },
  );

describe("gemini provider", () => {
  it("组装 generateContent 请求：text + inline_data，key 走 header", async () => {
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",
      );
      expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("gk");
      const body = JSON.parse(init!.body as string);
      expect(body.contents[0].parts[0]).toEqual({ text: "p" });
      expect(body.contents[0].parts[1]).toEqual({
        inline_data: { mime_type: "image/png", data: "xx" },
      });
      return okResponse();
    });
    const r = await createGeminiProvider({ apiKey: "gk", fetchImpl: f as typeof fetch }).generate({
      prompt: "p",
      images: ["data:image/png;base64,xx"],
    });
    expect(r.image).toBe("data:image/png;base64,AAAA");
  });

  it("拒绝非 Data URI 输入", async () => {
    const p = createGeminiProvider({ apiKey: "gk", fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(p.generate({ prompt: "p", images: ["https://x/y.png"] })).rejects.toThrow(/Data URI/);
  });

  it("429 重试后仍失败 → FurnaceOverheatError", async () => {
    const f = vi.fn(async () => new Response("quota", { status: 429 }));
    const p = createGeminiProvider({ apiKey: "gk", fetchImpl: f as typeof fetch });
    await expect(p.generate({ prompt: "p", images: [] })).rejects.toBeInstanceOf(FurnaceOverheatError);
    expect(f).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("超出 14 图上限直接抛错（级联执行器职责）", async () => {
    const p = createGeminiProvider({ apiKey: "gk", fetchImpl: vi.fn() as unknown as typeof fetch });
    const images = Array.from({ length: 15 }, () => "data:image/png;base64,xx");
    await expect(p.generate({ prompt: "p", images })).rejects.toThrow(/too many/);
  });
});
