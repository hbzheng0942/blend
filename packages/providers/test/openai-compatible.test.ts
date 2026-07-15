import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleProvider } from "../src/openai-compatible";

describe("OpenAI-compatible image provider", () => {
  it("uses the official multipart multi-image edits contract", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(init?.headers).toEqual({ Authorization: "Bearer test-key" });
      expect(form.get("model")).toBe("gpt-image-2");
      expect(form.get("prompt")).toBe("mutate");
      expect(form.getAll("image[]")).toHaveLength(2);
      return new Response(JSON.stringify({ data: [{ b64_json: "ZmFrZQ==" }] }), { status: 200 });
    });
    const provider = createOpenAICompatibleProvider({ apiKey: "test-key", fetchImpl: fetchImpl as typeof fetch });
    const image = "data:image/png;base64,iVBORw0KGgo=";
    const result = await provider.generate({ prompt: "mutate", images: [image, image] });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/edits");
    expect(result.image).toBe("data:image/png;base64,ZmFrZQ==");
  });

  it("accepts a custom base URL ending in v1 and URL responses", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [{ url: "https://cdn.test/output.png" }] }), { status: 200 }));
    const provider = createOpenAICompatibleProvider({
      apiKey: "key", baseUrl: "https://images.example.com/v1/", modelId: "custom-image", fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await provider.generate({ prompt: "blend", images: ["data:image/png;base64,AA=="] });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://images.example.com/v1/images/edits");
    expect(result.image).toBe("https://cdn.test/output.png");
  });
});
