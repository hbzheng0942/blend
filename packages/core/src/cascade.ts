import type { ExecutionStep } from "./types";

/** 级联执行器依赖的最小生成接口（由 provider 实现）。 */
export interface StepRunner {
  /** 输入图 hash 列表 + prompt → 生成一张图，返回其 hash。 */
  runStep(inputHashes: string[], prompt: string): Promise<string>;
  providerId: string;
  modelId: string;
  maxInputImages: number;
}

/**
 * 级联降级执行（PRD 1.3）：inputs 超过 maxInputImages 时自动分批，
 * 每批的中间结果作为下一批的第一张输入。每一步记入 executionPlan。
 */
export async function runCascade(
  inputHashes: string[],
  prompt: string,
  runner: StepRunner,
): Promise<{ outputHash: string; executionPlan: ExecutionStep[] }> {
  if (inputHashes.length === 0) throw new Error("cascade needs at least 1 input image");
  const max = runner.maxInputImages;
  if (max < 2) throw new Error(`maxInputImages must be >= 2, got ${max}`);

  const plan: ExecutionStep[] = [];
  let carry: string | null = null;
  let rest = [...inputHashes];

  while (rest.length > 0 || plan.length === 0) {
    const room = carry === null ? max : max - 1;
    const batch = [...(carry !== null ? [carry] : []), ...rest.splice(0, room)];
    const outputHash = await runner.runStep(batch, prompt);
    plan.push({
      inputHashes: batch,
      prompt,
      outputHash,
      providerId: runner.providerId,
      modelId: runner.modelId,
    });
    carry = outputHash;
    if (rest.length === 0) break;
  }

  return { outputHash: carry!, executionPlan: plan };
}
