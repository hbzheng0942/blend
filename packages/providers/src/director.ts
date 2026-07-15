import type { DirectorConcept, OperatorId } from "@blend/core";
import {
  buildDirectorSystemPrompt, buildDirectorUserText, parseDirectorConcepts, parseDirectorSketch,
} from "@blend/core";
import { AGNES_BASE_URL } from "./agnes";

/**
 * Agnes VLM director：走 /v1/chat/completions（OpenAI 兼容，多模态）。
 * 模型 agnes-2.0-flash（非推理模型）：director 只做识图 + 短 JSON 规划。
 * 任何失败（超时/限流/JSON 不合法）一律返回 null，由调用方回退静态骨架——
 * director 是增强层，不允许增加锻造失败面。
 */

export const AGNES_DIRECTOR_MODEL = "agnes-2.0-flash";
const TIMEOUT_MS = 28_000;
// 正常实测 11–17s；只补一次网络重试，把最坏等待从 3 分钟压到 1 分钟内。
const RETRY_DELAYS_MS = [1_500];

export type DirectorIssue = "timeout" | "rate-limit" | "upstream" | "network" | "invalid-response";

export interface DirectorOutcome {
  concepts: DirectorConcept[] | null;
  issue?: DirectorIssue;
}

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
  /** 守序 0 ⇄ 1 混沌，缺省 0.5；只驱动 brief 的语义距离 */
  chaos?: number;
  signal?: AbortSignal;
}

export interface AgnesDirector {
  modelId: string;
  direct(req: DirectRequest): Promise<DirectorConcept[] | null>;
  directDetailed(req: DirectRequest): Promise<DirectorOutcome>;
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
    const chaos = req.chaos ?? 0.5;
    const body = {
      model: modelId,
      // 创意距离由 brief 精确控制；低温保持 JSON、命名和锚点稳定。
      temperature: 0.35,
      // 导演只需要短 JSON；关闭推理，避免 reasoning_content 吃光预算却没有正文。
      enable_thinking: false,
      max_tokens: 1_000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildDirectorSystemPrompt(req.count, chaos) },
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
    if (!resp.ok) throw new Error(`agnes director HTTP ${resp.status}`);
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    };
    const message = json.choices?.[0]?.message;
    if (message?.content) return parseDirectorConcepts(message.content);
    // agnes-2.0-flash 本身不是推理模型；这是上游字段路由兼容，不向 UI 暴露草稿。
    return message?.reasoning_content ? parseDirectorSketch(message.reasoning_content) : null;
  }

  function classifyIssue(error: unknown): DirectorIssue {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|timed out|aborted/i.test(message) || (error instanceof DOMException && error.name === "TimeoutError")) {
      return "timeout";
    }
    if (/HTTP 429/.test(message)) return "rate-limit";
    if (/HTTP \d+/.test(message)) return "upstream";
    return "network";
  }

  async function directDetailed(req: DirectRequest): Promise<DirectorOutcome> {
    let issue: DirectorIssue = "network";
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        // HTTP 200 但正文不可解析属于确定性协议问题：立即降级，重复请求只会浪费时间。
        const concepts = await once(req);
        return concepts ? { concepts } : { concepts: null, issue: "invalid-response" };
      } catch (error) {
        issue = classifyIssue(error);
      }
      if (req.signal?.aborted) return { concepts: null, issue: "network" };
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]!);
    }
    return { concepts: null, issue };
  }

  async function direct(req: DirectRequest): Promise<DirectorConcept[] | null> {
    return (await directDetailed(req)).concepts;
  }

  return { modelId, direct, directDetailed };
}
