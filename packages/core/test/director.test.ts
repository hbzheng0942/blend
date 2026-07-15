import { describe, expect, it } from "vitest";
import {
  buildDirectorSystemPrompt,
  buildDirectorUserText,
  parseDirectorConcepts,
  parseDirectorSketch,
  resolveDirectorConceptBatch,
} from "../src";

const CONCEPT = {
  name: "Glazed Abyssal Teapot",
  prompt:
    "A majestic teapot shaped like the bulbous head of a deep-sea creature, glossy crackled " +
    "blue-grey glaze, sinuous tentacles forming the handle, studio lighting, plain background.",
};

describe("director brief", () => {
  it("system prompt 携带方案数与 JSON 契约", () => {
    const s = buildDirectorSystemPrompt(3);
    expect(s).toContain("up to 3 genuinely strong, DISTINCT concepts");
    expect(s).toContain("Return JSON immediately");
    expect(s).toContain("BOOM gate");
    expect(s).toContain("BEHAVIOR / FUNCTION");
    expect(s).toContain('"equation"');
    expect(s).toContain('{"concepts"');
  });

  it("守序与混沌改变语义距离，但都保留视觉锚点", () => {
    const order = buildDirectorSystemPrompt(2, 0.15);
    const chaos = buildDirectorSystemPrompt(2, 0.85);
    expect(order).toContain("OBJECT / STRUCTURE");
    expect(order).toContain("unmistakable shape or mechanism from every input");
    expect(chaos).toContain("MEANING / WORLD RULE");
    expect(chaos).toContain("Traceability leash");
    expect(chaos).toContain("main noun/category must be neither original source");
    expect(chaos).toContain("Counterfactual engine");
    expect(chaos).toContain("Do not reuse a universal macro/micro formula");
  });

  it("user text 组装：意图 + 风格约束 + 用户补充", () => {
    const t = buildDirectorUserText({
      operator: "fuse",
      count: 2,
      styleFragments: ["rendered as glossy glazed ceramic"],
      userPromptExtra: "glowing runes",
    });
    expect(t).toContain("FUSE:");
    expect(t).toContain("Design 2 distinct concepts");
    expect(t).toContain("glossy glazed ceramic");
    expect(t).toContain("glowing runes");
  });

  it("无风格/补充时不输出空段落", () => {
    const t = buildDirectorUserText({ operator: "inject", count: 2, styleFragments: [] });
    expect(t).not.toContain("style constraints");
    expect(t).not.toContain("extra wish");
  });
});

describe("parseDirectorSketch", () => {
  it("回收 Agnes 错放在 reasoning_content 的完整方案", () => {
    const sketch = `Input analysis omitted.
Concept 1 (Macro Phenomenon)
- Final Concept 1 Name: **冰封日珥** (Frozen prominence)
- Equation: 太阳的暴怒 × 月亮的收容 → 凝结的等离子风暴 (translation)
- Prompt: A colossal vortex of molten orange plasma trapped inside a pale blue porous crescent shell, frozen cosmic lightning, surreal scale.

Concept 2 (Micro Organism)
- Name: **吞光月胚**
- Equation: 日核的能量 × 月壳的囊泡 → 会捕食星光的细胞
- Prompt: A single moon-shaped cell with a cratered membrane, pearl organelles and a blazing solar nucleus, trailing fiery cilia through black space.`;
    expect(parseDirectorSketch(sketch)).toEqual([
      {
        name: "冰封日珥",
        equation: "太阳的暴怒 × 月亮的收容 → 凝结的等离子风暴",
        prompt: "A colossal vortex of molten orange plasma trapped inside a pale blue porous crescent shell, frozen cosmic lightning, surreal scale.",
      },
      {
        name: "吞光月胚",
        equation: "日核的能量 × 月壳的囊泡 → 会捕食星光的细胞",
        prompt: "A single moon-shaped cell with a cratered membrane, pearl organelles and a blazing solar nucleus, trailing fiery cilia through black space.",
      },
    ]);
  });

  it("未写完 Prompt 的方案不回收", () => {
    expect(parseDirectorSketch("Concept 1\nName: 月胚\nEquation: 日 × 月 → 胚胎")).toBeNull();
  });

  it("缺少命名时保留可用 Prompt，而不是判导演离线", () => {
    expect(parseDirectorSketch("Concept 1\nPrompt: A luminous cellular galaxy folding a solar core into a cratered lunar membrane, one coherent organism.")).toEqual([
      {
        name: "异变方案1",
        prompt: "A luminous cellular galaxy folding a solar core into a cratered lunar membrane, one coherent organism.",
      },
    ]);
  });

  it("回收上游 length 截断前已经写完整的 Fusion Concept 草稿", () => {
    const sketch = `**Fusion Concept 1: The Chrono-Bonsai**
- Chinese chars: 时光盆景. Let's use "时光盆景".
- Equation: 复古闹钟 + 盆景 = 机械生命体 (translation)
- Prompt: A surreal fusion where an alarm clock casing forms a twisted bonsai trunk, with roots wrapping the metal base and foliage replacing its bells.

**Fusion Concept 2: Eternal Growth**
- Chinese chars: 岁月之树. Let's use "岁月之树".
- Equation: 老式时钟 + 松树 = 自然与时间的融合 (translation)
- Prompt: A classic alarm clock overtaken by a pine bonsai, exposed roots forming the number ring and twin bells transformed into moss-covered branches.

Let's refine the JSON structure.
Concept 1:
Name: 时光盆景`;
    expect(parseDirectorSketch(sketch)).toEqual([
      {
        name: "时光盆景",
        equation: "复古闹钟 + 盆景 = 机械生命体",
        prompt: "A surreal fusion where an alarm clock casing forms a twisted bonsai trunk, with roots wrapping the metal base and foliage replacing its bells.",
      },
      {
        name: "岁月之树",
        equation: "老式时钟 + 松树 = 自然与时间的融合",
        prompt: "A classic alarm clock overtaken by a pine bonsai, exposed roots forming the number ring and twin bells transformed into moss-covered branches.",
      },
    ]);
  });
});

describe("parseDirectorConcepts", () => {
  it("纯 JSON", () => {
    const r = parseDirectorConcepts(JSON.stringify({ concepts: [CONCEPT] }));
    expect(r).toEqual([CONCEPT]);
  });

  it("JSON 缺少命名时不丢弃有效生成方案", () => {
    expect(parseDirectorConcepts(JSON.stringify({ concepts: [{ prompt: CONCEPT.prompt }] }))).toEqual([
      { name: "异变方案1", prompt: CONCEPT.prompt },
    ]);
  });

  it("保留可传播的语义方程", () => {
    const concept = { ...CONCEPT, equation: "深海的幽暗 × 茶壶的仪式 → 深渊下午茶" };
    expect(parseDirectorConcepts(JSON.stringify({ concepts: [concept] }))).toEqual([concept]);
  });

  it("容忍 ```json 围栏与前后杂文", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify({ concepts: [CONCEPT] }) + "\n```\nEnjoy!";
    expect(parseDirectorConcepts(text)).toEqual([CONCEPT]);
  });

  it("容忍无围栏的前置说明文字", () => {
    const text = "Sure! " + JSON.stringify({ concepts: [CONCEPT] });
    expect(parseDirectorConcepts(text)).toEqual([CONCEPT]);
  });

  it("兼容 Agnes 偶发省略 concepts 外壳或改用 results", () => {
    expect(parseDirectorConcepts(JSON.stringify(CONCEPT))).toEqual([CONCEPT]);
    expect(parseDirectorConcepts(JSON.stringify({ results: [CONCEPT] }))).toEqual([CONCEPT]);
    expect(parseDirectorConcepts(JSON.stringify([CONCEPT]))).toEqual([CONCEPT]);
  });

  it("过滤结构不合法的条目；全废时返回 null", () => {
    const mixed = JSON.stringify({ concepts: [{ name: "x", prompt: "too short" }, CONCEPT] });
    expect(parseDirectorConcepts(mixed)).toEqual([CONCEPT]);
    expect(parseDirectorConcepts(JSON.stringify({ concepts: [{ name: "x" }] }))).toBeNull();
    expect(parseDirectorConcepts(JSON.stringify({ nope: 1 }))).toBeNull();
    expect(parseDirectorConcepts("not json at all")).toBeNull();
  });
});

describe("resolveDirectorConceptBatch", () => {
  const fallback = { name: "机械融合体", prompt: CONCEPT.prompt };

  it("导演失败时只返回一套，不用同 prompt 补齐候选数", () => {
    expect(resolveDirectorConceptBatch(null, 2, fallback)).toEqual({
      concepts: [fallback],
      source: "fallback",
    });
  });

  it("导演只给一套时就只炼一套", () => {
    expect(resolveDirectorConceptBatch([CONCEPT], 2, fallback)).toEqual({
      concepts: [CONCEPT],
      source: "vlm",
    });
  });

  it("导演给多套时按请求上限截断", () => {
    const second = { ...CONCEPT, name: "第二方案" };
    expect(resolveDirectorConceptBatch([CONCEPT, second], 1, fallback).concepts).toEqual([CONCEPT]);
  });
});
