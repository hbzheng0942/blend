import type { GenerateRequest, GenerateResult, Provider, ProviderCapabilities } from "./types";
import { FurnaceOverheatError } from "./types";

/**
 * Gemini provider（BYOK，PRD 2.3）：Google Generative Language API 直连。
 * generateContent 多模态：parts = [text, inline_data...]，响应 parts 里取 inlineData 图。
 * 多图理解上限 14（PRD 值），全操作符可用（Nano Banana 系列指令遵循强；
 * subtract/intersect 仍推荐走 director，但不在 capability 层禁用）。
 */

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-image";
const TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [2_000, 8_000];

export interface GeminiConfig {
  apiKey: string;
  baseUrl?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}

const CAPABILITIES: ProviderCapabilities = {
  maxInputImages: 14,
  supportedOperators: ["auto", "fuse", "inject", "absorb", "subtract", "intersect"],
  maxResolution: "1024x1024",
};

/** Data URI → inline_data part；HTTPS URL 不支持（blend 输入一律 Data URI）。 */
function toInlinePart(dataUri: string): { inline_data: { mime_type: string; data: string } } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUri);
  if (!m) throw new Error("gemini provider 只接受 Data URI 输入");
  return { inline_data: { mime_type: m[1]!, data: m[2]! } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createGeminiProvider(config: GeminiConfig): Provider {
  const modelId = config.modelId ?? GEMINI_DEFAULT_MODEL;
  const base = (config.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, "");

  const doFetch = config.fetchImpl ?? fetch;

  async function once(req: GenerateRequest): Promise<GenerateResult> {
    const body = {
      contents: [
        { parts: [{ text: req.prompt }, ...req.images.map((u) => toInlinePart(u))] },
      ],
      generationConfig: { responseModalities: ["IMAGE"] },
    };
    const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    const resp = await doFetch(
      `${base}/v1beta/models/${modelId}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      },
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err = new Error(`gemini HTTP ${resp.status}: ${text.slice(0, 200)}`) as Error & {
        status: number;
      };
      err.status = resp.status;
      throw err;
    }
    const json = (await resp.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new Error("gemini response contains no image");
    return {
      image: `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data}`,
      seed: req.seed,
      raw: json,
    };
  }

  async function generate(req: GenerateRequest): Promise<GenerateResult> {
    if (req.images.length > CAPABILITIES.maxInputImages) {
      throw new Error(
        `too many input images: ${req.images.length} > ${CAPABILITIES.maxInputImages}（应由级联执行器分批）`,
      );
    }
    req.images.forEach((u) => void toInlinePart(u)); // 输入校验不进重试循环
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await once(req);
      } catch (e) {
        lastErr = e;
        if (req.signal?.aborted) throw e;
        const status = (e as { status?: number }).status;
        const retriable =
          status === undefined || status === 429 || (status >= 500 && status < 600);
        if (!retriable || attempt === RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]!);
      }
    }
    if ((lastErr as { status?: number }).status === 429) {
      throw new FurnaceOverheatError("锻造炉过热：Gemini 配额限流", 30, 429);
    }
    throw lastErr;
  }

  return {
    id: "gemini",
    displayName: `Gemini (${modelId})`,
    capabilities: CAPABILITIES,
    quota: { type: "paid-byok", notes: "需自备 Google AI Studio API key（aistudio.google.com）" },
    generate,
  };
}
