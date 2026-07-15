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
  /** 抽象语义方程，用于解释这张卡为什么成立 */
  equation?: string;
}

/**
 * 导演产出多少套就炼多少套；导演完全失联时只保留一个明确标注的本地方案。
 * 这里不补齐数量，避免拿同一条静态 prompt 伪造两张“候选”。
 */
export function resolveDirectorConceptBatch(
  directed: DirectorConcept[] | null,
  requested: number,
  fallback: DirectorConcept,
): { concepts: DirectorConcept[]; source: "vlm" | "fallback" } {
  const concepts = directed?.slice(0, Math.max(1, requested)).filter((concept) => concept.prompt.trim());
  return concepts?.length
    ? { concepts, source: "vlm" }
    : { concepts: [fallback], source: "fallback" };
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

/**
 * 守序 0 ⇄ 1 混沌控制“语义距离”，不是随机度：
 * 物体结构 → 行为/功能 → 意义/世界规则。
 */
function chaosDirective(chaos: number): string {
  if (chaos < 0.34) {
    return (
      "- Semantic distance: OBJECT / STRUCTURE. Make a believable physical fusion. Choose one " +
      "dominant silhouette, but preserve at least one unmistakable shape or mechanism from every " +
      "input. Fuse construction, material or anatomy; do not turn the pair into a cosmic metaphor.\n" +
      "- Candidate spread: use different dominant hosts or physical mechanisms, while keeping both " +
      "sources readable at first glance."
    );
  }
  if (chaos < 0.67) {
    return (
      "- Semantic distance: BEHAVIOR / FUNCTION. Keep one concrete visual anchor from every input, " +
      "then fuse what they DO: rhythm, growth, containment, attraction, release, protection or decay.\n" +
      "- Candidate spread: one may remain a transformed object; another may become a new organism, " +
      "tool or habitat. Each still needs a clear silhouette and visible cause-and-effect."
    );
  }
  return (
    "- Semantic distance: MEANING / WORLD RULE. Start from the tension, shared law or cultural " +
    "meaning behind the inputs, then invent a new ontology. At least one input must contribute " +
    "ONLY a behavior, function or meaning — not its appearance. The result's main noun/category " +
    "must be neither original source. Do NOT make A wearing B's texture, a side-by-side collage, " +
    "or merely an A-B hybrid noun.\n" +
    "- Traceability leash: preserve at least one concrete, visible and causally meaningful trace " +
    "from every input. Translate abstract forces into mechanics: orbit can become metabolism, " +
    "detonation can become dispersal, an alarm can become a biological trigger. The leap should " +
    "feel surprising after one second and inevitable after five.\n" +
    "- Counterfactual engine: ask what NEW thing would exist if one input's behavior had to obey " +
    "the other input's law. Reject the first literal hybrid answer.\n" +
    "- Candidate spread: choose different ontological lanes appropriate to this pair, such as " +
    "organism, ritual tool, phenomenon, habitat or system. Do not reuse a universal macro/micro formula."
  );
}

export function buildDirectorSystemPrompt(count: number, chaos = 0.5): string {
  return (
    "You are the concept director of an image-fusion game. The image generator will also see the " +
    `original inputs. Return up to ${count} genuinely strong, DISTINCT concepts; omit a weak extra ` +
    "concept instead of padding the set.\n" +
    "Return JSON immediately. Never output analysis, image descriptions, brainstorming or revisions.\n" +
    "Internally identify each input's visual anchors, behavior/function and meaning, then apply the " +
    "requested semantic distance. Before returning, reject any concept that fails the BOOM gate:\n" +
    "1) ONE-SECOND READ: one focal subject and a legible silhouette.\n" +
    "2) TRACEABLE: visible evidence from every input, not a caption-dependent metaphor.\n" +
    "3) NON-OBVIOUS: not simple texture transfer, decoration or two objects glued together.\n" +
    "4) IMAGEABLE: a concrete scene the image model can render, with visible mechanics.\n" +
    chaosDirective(chaos) + "\n" +
    "- If a user direction is provided, it IS the creative core: keep its intent faithfully " +
    "and only refine it into an effective brief — do not override it or bolt on unrelated ideas.\n" +
    "- Each concept gets a NAME in Chinese: 2-6 个字，言简意赅，可以带幽默感或反差萌" +
    "（如「章鱼茶壶」「深渊下午茶」），不要英文不要拼音。\n" +
    '- Each concept gets an "equation" in Chinese, 8-24 characters, showing the conceptual ' +
    'leap in the form “A的某种本质 × B的某种本质 → 新概念”. Example structure only: ' +
    '“潮汐的节律 × 引擎的推力 → 会呼吸的航道”. Do not merely repeat object names.\n' +
    '- The "prompt" field: a concise English art-direction brief (25-55 words) naming the ' +
    "single subject, the visible anchor from each input, the fusion mechanism, scale, mood and lighting. " +
    "Prefer concrete nouns and verbs over abstract adjectives. No inventories of fine details. " +
    'It must not reference "image 1/2".\n' +
    'Output STRICT JSON only: {"concepts":[{"name":"...","equation":"...","prompt":"..."}]}. ' +
    `Never return more than ${count} concepts.`
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
  if (extra) parts.push("User direction (the creative core — refine it, don't override it): " + extra);
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
    const parsed = JSON.parse(s) as Record<string, unknown> | unknown[];
    // Agnes 偶发忽略外层 concepts 包装，或改用 results；内容有效时不应被误判为“离线”。
    const candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.concepts)
        ? parsed.concepts
        : Array.isArray(parsed.results)
          ? parsed.results
          : typeof parsed.prompt === "string"
            ? [parsed]
            : [];
    const concepts = candidates.flatMap((c, index): DirectorConcept[] => {
      const name = (c as DirectorConcept).name;
      const prompt = (c as DirectorConcept).prompt;
      const equation = (c as DirectorConcept).equation;
      return typeof prompt === "string" && prompt.trim().length >= 20
        ? [{ name: typeof name === "string" && name.trim() ? name.trim() : `异变方案${index + 1}`, prompt: prompt.trim(), ...(typeof equation === "string" && equation.trim() ? { equation: equation.trim() } : {}) }]
        : [];
    });
    return concepts.length ? concepts : null;
  } catch {
    return null;
  }
}

/**
 * Agnes 偶发把普通模型输出误放进 reasoning_content，并以 Markdown 草稿返回。
 * Prompt 是唯一会影响生成的必需字段；命名和公式只是展示元数据，缺失时补稳定名称，
 * 绝不因为展示字段缺失而丢掉可用的导演方案，也不为了凑候选数复制 prompt。
 */
export function parseDirectorSketch(text: string): DirectorConcept[] | null {
  const blocks = text.split(
    /\n(?=(?:\*{0,2})?(?:(?:Fusion\s+)?(?:Strategy\s*-\s*)?)?Concept\s*\d)/i,
  );
  const concepts = blocks.flatMap((block, index): DirectorConcept[] => {
    const promptMatches = [...block.matchAll(/(?:Refined\s+)?Prompt\s*[:：]\s*\**([^\n]+)/gi)];
    const promptRaw = promptMatches.at(-1)?.[1]?.replace(/\*+/g, "").trim();
    if (!promptRaw || promptRaw.length < 20) return [];

    const nameMatches = [...block.matchAll(/(?:Final\s+|Refined\s+)?(?:Concept\s*\d+\s*)?Name[^:：\n]*[:：]\s*\**([^\n]+)/gi)];
    const chosenMatches = [
      ...block.matchAll(/(?:Let's use|Use)\s+["“]?([\p{Script=Han}]{2,6})["”]?/giu),
    ];
    const nameRaw = nameMatches.at(-1)?.[1] ?? chosenMatches.at(-1)?.[1] ?? "";
    const chineseNames = [...nameRaw.matchAll(/[\p{Script=Han}]{2,6}/gu)].map((match) => match[0]);
    const name = chineseNames.at(-1) ?? `异变方案${index + 1}`;

    const equationMatches = [...block.matchAll(/(?:Refined\s+)?Equation\s*[:：]\s*\**([^\n]+)/gi)];
    const equationRaw = equationMatches.at(-1)?.[1]
      ?.replace(/\*+/g, "")
      .split(/\s*\(/)[0]
      ?.trim();
    return [{ name, prompt: promptRaw, ...(equationRaw ? { equation: equationRaw } : {}) }];
  });
  return concepts.length ? concepts : null;
}
