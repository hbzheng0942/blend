/** blend 核心数据模型（PRD 1.1，DECISION LOCKED）。 */

import type { RecipePlan } from "./recipecode";

export type OperatorId = "auto" | "fuse" | "inject" | "subtract" | "intersect" | "absorb";
export type BlendMode = "forge" | "recast";

/** 内容寻址的原始要素：图片以 sha256 存 blob store，全局去重。 */
export interface Element {
  id: string;
  imageHash: string;
  source: "upload" | "generated";
  createdAt: number;
  meta?: { width?: number; height?: number; mime?: string; label?: string };
}

/** 配方 = 意图。同一 Recipe 可重 roll、可换模型重跑。 */
export interface Recipe {
  /** 0 个=根节点(纯要素融合)，1 个=迭代，2+ 个=分支合并 */
  parentNodeIds: string[];
  /** 本轮新增的原始要素 */
  elementIds: string[];
  operator: OperatorId;
  styleTags: string[];
  userPromptExtra?: string;
  /** 守序 0 ⇄ 1 混沌（director 的语义距离），缺省 0.5 */
  chaos?: number;
  /** forge=喂上轮输出图（信息衰减美学）；recast=全要素重新融合（高保真） */
  mode: BlendMode;
}

/** 级联执行的单步记录（可复现性关键）。 */
export interface ExecutionStep {
  inputHashes: string[];
  prompt: string;
  outputHash: string;
  providerId: string;
  modelId: string;
}

/** 一次抽卡产出的候选。 */
export interface Output {
  id: string;
  imageHash: string;
  seed?: number;
  executionPlan: ExecutionStep[];
  providerId: string;
  modelId: string;
  /** 实际发送的完整 prompt */
  finalPrompt: string;
  /** VLM director 给该候选方案的命名（无 director 时缺省） */
  conceptName?: string;
  /** 输入之间的抽象语义跃迁，适合卡面传播 */
  conceptEquation?: string;
  /** vlm=导演理解后生成；fallback=导演不可用时的单方案降级 */
  conceptSource?: "vlm" | "fallback";
}

/** 谱系树节点：候选全保留，canonical 可反悔改选。 */
export interface BlendNode {
  id: string;
  recipe: Recipe;
  outputs: Output[];
  canonicalOutputId: string | null;
  createdAt: number;
}

export interface Tree {
  id: string;
  title: string;
  rootElementIds: string[];
  nodeIds: string[];
  /** 谱系画布节点位置 */
  canvasLayout: Record<string, { x: number; y: number }>;
  /** 由配方码导入、待重演绎的 plan（重演绎完成后清除） */
  importedPlan?: RecipePlan;
  createdAt: number;
  updatedAt: number;
}
