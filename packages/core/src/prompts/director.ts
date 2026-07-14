import type { OperatorId } from "../types";

/**
 * VLM Director：在静态操作符骨架之上加一层"提示词导演"。
 * 一次调用看全部输入图 + 操作意图，产出 N 条互异的具体设计方案
 * （每条对应一张抽卡候选），解决静态骨架的两个问题：
 * 1. 多图融合无取舍 → director 显式分配每张图贡献什么（形态/材质/氛围）
 * 2. 候选只是同 prompt 重抽 → 每张候选拿到不同的设计方案
 * 实测记录见 docs/spike-results.md（agnes-2.0-flash，~17s/次；
 * agnes-2.5-flash 2026-07-13 时点尚未开放，model_not_found）。
 */

export interface DirectorConcept {
  /** 简短的作品命名（上卡面用） */
  name: string;
  /** 自足的英文生图 prompt，不引用 image 1/2 */
  prompt: string;
}

/** 每个操作符给 director 的意图陈述（比生图骨架更抽象，留出创作空间）。 */
export const DIRECTOR_INTENTS: Record<OperatorId, string> = {
  auto:
    "AUTO: First silently classify each input (entity / creature / material / texture / " +
    "scene / mood). Then choose the fusion structure that fits these inputs best — equal fuse, " +
    "keep-form material inject, host absorbing fragments, or distilling a shared essence — " +
    "and design the concepts accordingly. Pick the structure that will look best, not the flashiest.",
  fuse:
    "FUSE: merge all input subjects into one coherent new object/creature. " +
    "Decide deliberately which input contributes silhouette/anatomy, which contributes " +
    "surface/material, and which contributes mood/detail — never a 50/50 mush.",
  inject:
    "INJECT: the first subject keeps its exact form and silhouette, but is physically " +
    "re-manufactured out of the material/texture/energy of the other subject(s). " +
    "Push the material logic to a surprising extreme.",
  subtract:
    "SUBTRACT: depict the first subject with every visual quality of the other subject(s) " +
    "explicitly stripped away or inverted. Describe what remains, concretely.",
  intersect:
    "INTERSECT: depict ONLY the visual and conceptual qualities that ALL inputs share. " +
    "Distill their common essence into one brand-new subject that is none of the originals.",
  absorb:
    "ABSORB: the first subject is the dominant host and keeps its identity, visibly " +
    "absorbing fragments and details of the other subjects into its surface and structure.",
};

/** 守序 0 ⇄ 1 混沌：创意强度分三档措辞。 */
function chaosDirective(chaos: number): string {
  if (chaos < 0.34) {
    return (
      "- Creative register: FAITHFUL. Stay close to the inputs' original forms, proportions " +
      "and palette; the fusion should feel like a clean, believable craft object. No " +
      "reinterpretation, no scale changes."
    );
  }
  if (chaos < 0.67) {
    return (
      "- Creative register: BALANCED. Build each concept around ONE clear creative idea. " +
      "The result should feel natural and inevitable — creative, but never forced."
    );
  }
  return (
    "- Creative register: WILD. Bold reinterpretation encouraged: scale twists, unexpected " +
    "function, poetic re-reading of the inputs. Still one coherent subject, not a collage."
  );
}

export function buildDirectorSystemPrompt(count: number, chaos = 0.5): string {
  return (
    "You are a senior concept artist for an image-fusion art tool. " +
    `You are given input images and a fusion intent. Design ${count} DISTINCT fusion concepts.\n` +
    "Rules:\n" +
    "- Each concept makes deliberate design choices about what each input contributes. " +
    "Concepts must differ clearly from each other in design direction.\n" +
    chaosDirective(chaos) + "\n" +
    "- Aesthetics: one clear focal subject; restrained palette anchored to the dominant " +
    "input (the other inputs accent, not flood); one coherent light source; generous " +
    "negative space. Never pile up elements — leave things out.\n" +
    "- Each concept gets a NAME in Chinese: 2-6 个字，言简意赅，可以带幽默感或反差萌" +
    "（如「章鱼茶壶」「深渊下午茶」），不要英文不要拼音。\n" +
    '- The "prompt" field must be a self-contained English image-generation prompt ' +
    "(30-60 words), concrete and visual, describing the SINGLE fused subject, its " +
    'materials, lighting and background — written like a tight concept-art brief, ' +
    'not an inventory. It must not reference "image 1/2".\n' +
    'Output STRICT JSON only: {"concepts":[{"name":"...","prompt":"..."}]}'
  );
}

export function buildDirectorUserText(args: {
  operator: OperatorId;
  count: number;
  styleFragments: string[];
  userPromptExtra?: string;
}): string {
  const parts = [
    `Fusion intent: ${DIRECTOR_INTENTS[args.operator]}`,
    `Design ${args.count} distinct concepts.`,
  ];
  if (args.styleFragments.length) {
    parts.push("Mandatory style constraints (weave into every concept): " + args.styleFragments.join("; ") + ".");
  }
  const extra = args.userPromptExtra?.trim();
  if (extra) parts.push("User's extra wish (honor it): " + extra);
  return parts.join("\n");
}

/**
 * 解析 director 回复。容忍 ```json 围栏与前后杂文；
 * 结构不合法返回 null（调用方静默回退静态骨架）。
 */
export function parseDirectorConcepts(text: string): DirectorConcept[] | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1]!.trim();
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    if (start < 0) return null;
    s = s.slice(start, s.lastIndexOf("}") + 1);
  }
  try {
    const parsed = JSON.parse(s) as { concepts?: unknown };
    if (!Array.isArray(parsed.concepts)) return null;
    const concepts = parsed.concepts.flatMap((c): DirectorConcept[] => {
      const name = (c as DirectorConcept).name;
      const prompt = (c as DirectorConcept).prompt;
      return typeof name === "string" && typeof prompt === "string" && prompt.trim().length >= 20
        ? [{ name: name.trim(), prompt: prompt.trim() }]
        : [];
    });
    return concepts.length ? concepts : null;
  } catch {
    return null;
  }
}
