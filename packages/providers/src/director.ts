import type { DirectorConcept, OperatorId } from "@blend/core";
import { buildDirectorSystemPrompt, buildDirectorUserText, parseDirectorConcepts } from "@blend/core";
import { AGNES_BASE_URL } from "./agnes";

/**
 * Agnes VLM director：走 /v1/chat/completions（OpenAI 兼容，多模态）。
 * 模型 agnes-2.0-flash（2026-07-13 实测：图像理解可用，~13-17s；
 * agnes-2.5-flash 尚未开放渠道 → model_not_found，开放后改这里即可）。
 * 任何失败（超时/限流/JSON 不合法）一律返回 null，由调用方回退静态骨架——
 * director 是增强层，不允许增加锻造失败面。
 */

export const AGNES_DIRECTOR_MODEL = "agnes-2.0-flash";
const TIMEOUT_MS = 60_000;
// 上游 chat 端点随机断连较频繁（尤其大 payload），多给两次机会
const RETRY_DELAYS_MS = [2_000, 6_000];

export interface DirectorConfig {
  apiKey: string;
  baseUrl?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}

export interface DirectRequest {
  operator: OperatorId;
  /** Data URI 或 HTTPS URL，与生图输入同源 */
  images: string[];
  styleFragments: string[];
  userPromptExtra?: string;
  /** 期望方案数 = 候选数 */
  count: number;
  signal?: AbortSignal;
}

export interface AgnesDirector {
  modelId: string;
  direct(req: DirectRequest): Promise<DirectorConcept[] | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAgnesDirector(config: DirectorConfig): AgnesDirector {
  const modelId = config.modelId ?? AGNES_DIRECTOR_MODEL;
  const base = (config.baseUrl ?? AGNES_BASE_URL).replace(/\/$/, "");
  const doFetch = config.fetchImpl ?? fetch;

  async function once(req: DirectRequest): Promise<DirectorConcept[] | null> {
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: buildDirectorUserText({
          operator: req.operator,
          count: req.count,
          styleFragments: req.styleFragments,
          userPromptExtra: req.userPromptExtra,
        }),
      },
      ...req.images.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    const body = {
      model: modelId,
      temperature: 1.0,
      max_tokens: 400 * req.count,
      messages: [
        { role: "system", content: buildDirectorSystemPrompt(req.count) },
        { role: "user", content },
      ],
    };

    const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;
    const resp = await doFetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    return text ? parseDirectorConcepts(text) : null;
  }

  async function direct(req: DirectRequest): Promise<DirectorConcept[] | null> {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const concepts = await once(req);
        if (concepts) return concepts;
      } catch {
        /* 网络/超时 → 重试或放弃 */
      }
      if (req.signal?.aborted) return null;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]!);
    }
    return null;
  }

  return { modelId, direct };
}
