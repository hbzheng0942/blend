import type { GenerateRequest, GenerateResult, Provider, ProviderCapabilities } from "./types";
import { FurnaceOverheatError } from "./types";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
export const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-2";

const TIMEOUT_MS = 150_000;
const RETRY_DELAYS_MS = [2_000, 8_000];
const CAPABILITIES: ProviderCapabilities = {
  maxInputImages: 16,
  supportedOperators: ["auto", "fuse", "inject", "absorb", "subtract", "intersect"],
  maxResolution: "3840x3840",
};

export interface OpenAICompatibleConfig {
  apiKey: string;
  /** 可填 https://api.openai.com、.../v1，或兼容服务的等价前缀。 */
  baseUrl?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}

function editsEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return /\/v1$/i.test(base) ? `${base}/images/edits` : `${base}/v1/images/edits`;
}

function dataUriToBlob(uri: string): Blob {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
  if (!match) throw new Error("OpenAI-compatible provider 只接受 base64 Data URI 或 HTTPS URL");
  const bytes = Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

async function imageBlob(image: string, doFetch: typeof fetch): Promise<Blob> {
  if (image.startsWith("data:")) return dataUriToBlob(image);
  if (!/^https:\/\//i.test(image)) throw new Error("图片输入必须是 Data URI 或 HTTPS URL");
  const response = await doFetch(image);
  if (!response.ok) throw new Error(`读取输入图片失败：HTTP ${response.status}`);
  return response.blob();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): Provider {
  const baseUrl = config.baseUrl?.trim() || OPENAI_DEFAULT_BASE_URL;
  const modelId = config.modelId?.trim() || OPENAI_DEFAULT_IMAGE_MODEL;
  const doFetch = config.fetchImpl ?? fetch;

  async function once(req: GenerateRequest): Promise<GenerateResult> {
    const form = new FormData();
    form.append("model", modelId);
    form.append("prompt", req.prompt);
    const blobs = await Promise.all(req.images.map((image) => imageBlob(image, doFetch)));
    blobs.forEach((blob, index) => form.append("image[]", blob, `blend-input-${index + 1}.${blob.type.includes("jpeg") ? "jpg" : "png"}`));

    const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;
    const response = await doFetch(editsEndpoint(baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message = text.slice(0, 240);
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        message = parsed.error?.message ?? message;
      } catch { /* 兼容服务可能返回纯文本。 */ }
      const error = new Error(`OpenAI-compatible HTTP ${response.status}: ${message}`) as Error & { status: number };
      error.status = response.status;
      throw error;
    }

    const json = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const output = json.data?.[0];
    if (output?.b64_json) return { image: `data:image/png;base64,${output.b64_json}`, seed: req.seed, raw: json };
    if (output?.url) return { image: output.url, seed: req.seed, raw: json };
    throw new Error("OpenAI-compatible response contains no image");
  }

  async function generate(req: GenerateRequest): Promise<GenerateResult> {
    if (req.images.length === 0) throw new Error("OpenAI-compatible 编辑接口至少需要 1 张输入图");
    if (req.images.length > CAPABILITIES.maxInputImages) {
      throw new Error(`too many input images: ${req.images.length} > ${CAPABILITIES.maxInputImages}`);
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await once(req);
      } catch (error) {
        lastError = error;
        if (req.signal?.aborted) throw error;
        const status = (error as { status?: number }).status;
        const retryable = status === undefined || status === 429 || (status >= 500 && status < 600);
        if (!retryable || attempt === RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]!);
      }
    }
    if ((lastError as { status?: number }).status === 429) {
      throw new FurnaceOverheatError("锻造炉过热：OpenAI-compatible 配额限流", 30, 429);
    }
    throw lastError;
  }

  return {
    id: "openai-compatible",
    displayName: `OpenAI-compatible (${modelId})`,
    capabilities: CAPABILITIES,
    quota: { type: "paid-byok", notes: "自备 API key；浏览器直连，不经过 Blend Worker" },
    generate,
  };
}
