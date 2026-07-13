import type { OperatorId } from "@blend/core";

/** Provider 抽象（PRD 2.1，DECISION LOCKED）。 */

export interface ProviderCapabilities {
  maxInputImages: number;
  /** spike 实测：该模型下语义达标的操作符（其余 UI 置灰） */
  supportedOperators: OperatorId[];
  maxResolution: string;
}

export interface GenerateRequest {
  prompt: string;
  /** Data URI base64 或 HTTPS URL */
  images: string[];
  seed?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  /** Data URI（b64_json 响应）或远端 URL */
  image: string;
  seed?: number;
  raw?: unknown;
}

/** 限流/队列满时抛出，UI 层据此显示"熔炉过热"倒计时。 */
export class FurnaceOverheatError extends Error {
  constructor(
    message: string,
    /** 建议冷却秒数（客户端已按 2/8/30 退避仍失败后的展示值） */
    public cooldownSeconds: number,
    public status?: number,
  ) {
    super(message);
    this.name = "FurnaceOverheatError";
  }
}

export interface Provider {
  id: string;
  displayName: string;
  capabilities: ProviderCapabilities;
  quota: { type: "free-byok" | "paid-byok"; notes: string };
  generate(req: GenerateRequest): Promise<GenerateResult>;
}
