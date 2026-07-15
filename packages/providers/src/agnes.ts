import type { GenerateRequest, GenerateResult, Provider, ProviderCapabilities } from "./types";
import { FurnaceOverheatError } from "./types";

/**
 * Agnes provider（默认，免费 BYOK）。
 * 接口契约与限制均为 spike S1 实测（docs/spike-results.md）：
 * - POST {base}/v1/images/generations，OpenAI 兼容，Bearer 鉴权
 * - 多图放 extra_body.image[]（Data URI 可用），response_format 放 extra_body 内
 * - 多图上限 6 张（400 "at most 6 allowed"）
 * - 免费档限流形态是 503 "image queue is full" + 连接异常，而非 429
 * - 延迟中位 50s / 最长 269s → 超时 300s
 */

export const AGNES_BASE_URL = "https://apihub.agnes-ai.com";
const TIMEOUT_MS = 300_000;
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];

export interface AgnesConfig {
  apiKey: string;
  /** 自定义上游（如用户自部署的 CORS 反代） */
  baseUrl?: string;
  modelId?: AgnesModelId;
  fetchImpl?: typeof fetch;
  /** 公共通道可用更短等待；BYOK 默认保留长队列容忍度。 */
  timeoutMs?: number;
  retryDelaysMs?: number[];
  /** 公共炉可在主模型 5xx/队列满时切到另一条图像队列；BYOK 默认不切换。 */
  fallbackModelId?: AgnesModelId;
}

export type AgnesModelId = "agnes-image-2.0-flash" | "agnes-image-2.1-flash";

// subtract/intersect 由 VLM director 翻案解禁（core DIRECTOR_ONLY_OPERATORS）：
// 静态骨架下仍 fail，director 失败时调用方须报错而非回退。
const CAPABILITIES: Record<AgnesModelId, ProviderCapabilities> = {
  "agnes-image-2.0-flash": {
    maxInputImages: 6,
    supportedOperators: ["auto", "fuse", "inject", "absorb", "subtract", "intersect"],
    maxResolution: "1024x1024",
  },
  "agnes-image-2.1-flash": {
    maxInputImages: 6,
    supportedOperators: ["auto", "fuse", "inject", "absorb", "subtract", "intersect"],
    maxResolution: "4K",
  },
};

interface AgnesErrorBody {
  error?: { message?: string; code?: string };
}

function isQueueFull(status: number, body: AgnesErrorBody | null): boolean {
  if (status === 429) return true;
  if (status !== 503) return false;
  return /queue is full/i.test(body?.error?.message ?? "") || body?.error?.code === "do_request_failed";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAgnesProvider(config: AgnesConfig): Provider {
  const modelId: AgnesModelId = config.modelId ?? "agnes-image-2.0-flash";
  const base = (config.baseUrl ?? AGNES_BASE_URL).replace(/\/$/, "");
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? TIMEOUT_MS;
  const retryDelaysMs = config.retryDelaysMs ?? RETRY_DELAYS_MS;

  async function once(req: GenerateRequest, targetModelId = modelId): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: targetModelId,
      prompt: req.prompt,
      extra_body: {
        response_format: "b64_json",
        ...(req.images.length ? { image: req.images } : {}),
      },
      ...(targetModelId.includes("2.1") ? { size: "1K", ratio: "1:1" } : { size: "1024x1024" }),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    };

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    let resp: Response;
    try {
      resp = await doFetch(base + "/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (timeoutSignal.aborted && !req.signal?.aborted) {
        const timeoutError = new Error(`图像炉 ${Math.max(1, Math.round(timeoutMs / 1_000))} 秒未响应，请稍后再试`) as Error & { timeout: boolean };
        timeoutError.timeout = true;
        throw timeoutError;
      }
      throw error;
    }

    if (!resp.ok) {
      let parsed: AgnesErrorBody | null = null;
      let text = "";
      try {
        text = await resp.text();
        parsed = JSON.parse(text) as AgnesErrorBody;
      } catch {
        /* 上游偶发非 JSON 错误体 */
      }
      const err = new Error(
        `agnes HTTP ${resp.status}: ${parsed?.error?.message ?? text.slice(0, 200)}`,
      ) as Error & { status: number; queueFull: boolean };
      err.status = resp.status;
      err.queueFull = isQueueFull(resp.status, parsed);
      throw err;
    }

    const json = (await resp.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const d = json.data?.[0];
    if (d?.b64_json) {
      return { image: "data:image/png;base64," + d.b64_json, seed: req.seed, raw: { ...json, blendModelId: targetModelId } };
    }
    if (d?.url) return { image: d.url, seed: req.seed, raw: { ...json, blendModelId: targetModelId } };
    throw new Error("agnes response contains no image");
  }

  async function generate(req: GenerateRequest): Promise<GenerateResult> {
    if (req.images.length > CAPABILITIES[modelId].maxInputImages) {
      throw new Error(
        `too many input images: ${req.images.length} > ${CAPABILITIES[modelId].maxInputImages}（应由级联执行器分批）`,
      );
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      try {
        return await once(req);
      } catch (e) {
        lastErr = e;
        if (req.signal?.aborted) throw e;
        const status = (e as { status?: number }).status;
        // 可重试：队列满/5xx/网络层异常；4xx（除 429）不可重试
        const retriable =
          status === undefined || status === 429 || (status >= 500 && status < 600);
        if (!retriable || (e as { timeout?: boolean }).timeout || attempt === retryDelaysMs.length) break;
        await sleep(retryDelaysMs[attempt]!);
      }
    }
    const status = (lastErr as { status?: number }).status;
    const fallbackModelId = config.fallbackModelId;
    const canFailOver = fallbackModelId && fallbackModelId !== modelId
      && (status === undefined || status === 429 || (status >= 500 && status < 600));
    if (canFailOver) {
      try {
        return await once(req, fallbackModelId);
      } catch (fallbackError) {
        const fallbackStatus = (fallbackError as { status?: number }).status;
        if ((fallbackError as { queueFull?: boolean }).queueFull || fallbackStatus === 429) {
          throw new FurnaceOverheatError(`锻造炉过热：${modelId} 与 ${fallbackModelId} 队列均不可用`, 60, fallbackStatus);
        }
        throw fallbackError;
      }
    }
    if ((lastErr as { queueFull?: boolean }).queueFull || status === 429) {
      throw new FurnaceOverheatError("锻造炉过热：上游生成队列已满", 60, status);
    }
    throw lastErr;
  }

  return {
    id: "agnes",
    displayName: `Agnes (${modelId})`,
    capabilities: CAPABILITIES[modelId],
    quota: { type: "free-byok", notes: "免费注册即用，无绑卡；仅队列/RPM 限制" },
    generate,
  };
}
