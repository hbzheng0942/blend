import type { OperatorId } from "../types";

/**
 * 操作符 prompt 骨架。
 * inject 使用 spike S1 验证过的 v2 强化版（原版会被模型理解为"放进场景"，
 * 见 docs/spike-results.md §3）；subtract/intersect 的静态骨架 fail，
 * 仅作 DIRECTOR_ONLY_OPERATORS 的兜底文案，实际必须由 director 出 prompt。
 */
export const OPERATOR_PROMPTS: Record<OperatorId, string> = {
  // auto 的静态兜底 = fuse（真正的结构选择由 director 完成）
  auto:
    "Seamlessly fuse all subjects into one single coherent new object/creature, " +
    "blending their key visual features equally.",
  fuse:
    "Seamlessly fuse all subjects into one single coherent new object/creature, " +
    "blending their key visual features equally.",
  inject:
    "Recreate the object from image 1 as if it were physically manufactured out of " +
    "the material shown in image 2. Keep the exact shape, proportions and silhouette " +
    "of image 1's object, but its entire surface must be made of image 2's material " +
    "with its color, texture and finish. Plain studio background. Do not place the " +
    "object inside a scene or landscape.",
  subtract:
    "Take image 1 and remove/strip away all visual characteristics that resemble image 2.",
  intersect:
    "Distill and depict only the visual and conceptual qualities that ALL input images " +
    "share in common, as a single new image.",
  absorb:
    "Image 1 is the dominant host; embed fragments and details of the other images " +
    "into its surface and structure.",
};

export interface OperatorMeta {
  id: OperatorId;
  symbol: string;
  nameZh: string;
  nameEn: string;
  /** UI 提示：inject 的第二要素用材质图效果最佳（spike 结论） */
  hint?: string;
}

/**
 * 仅在 VLM director 出 prompt 时语义达标的操作符（spike 静态骨架 fail，
 * director 翻案实测 pass：spike/outputs/rescue_*.png）。
 * director 不可用/失败时这些操作符必须报错，不得回退静态骨架。
 */
export const DIRECTOR_ONLY_OPERATORS: ReadonlySet<OperatorId> = new Set(["subtract", "intersect"]);

export const OPERATORS: OperatorMeta[] = [
  {
    id: "auto", symbol: "✦", nameZh: "智能", nameEn: "Auto",
    hint: "导演看图判断每张的类型（实体/材质/场景/氛围），自动选最合适的融合结构——不确定选哪个时用它",
  },
  {
    id: "fuse", symbol: "⊕", nameZh: "融合", nameEn: "Fuse",
    hint: "适合：两个实体或生物。平等混血成一个全新物种；纹理/氛围图慎用（颜色会糊满全图）",
  },
  {
    id: "inject", symbol: "→", nameZh: "注入", nameEn: "Inject",
    hint: "适合：实体 + 质感强的图（材质、生物、星空）。第一张保形状，用后面的材质重做一遍",
  },
  {
    id: "subtract", symbol: "⊖", nameZh: "相减", nameEn: "Subtract",
    hint: "适合：想从第一张里剥离/反转第二张特征的进阶玩法（由导演解读，需在线）",
  },
  {
    id: "intersect", symbol: "∩", nameZh: "交集", nameEn: "Intersect",
    hint: "适合：三张以上互不相干的图。蒸馏它们唯一的共同气质，炼出全新之物（由导演解读，需在线）",
  },
  {
    id: "absorb", symbol: "⊃", nameZh: "吞噬", nameEn: "Absorb",
    hint: "适合：一个想保住的主体 + 若干配料图。宿主保持原样，配料拆成碎片长进它表面",
  },
];

/** provider 层可按模型注册 prompt 变体覆盖默认骨架。 */
export type OperatorPromptOverrides = Partial<Record<OperatorId, string>>;
