import { describe, expect, it } from "vitest";
import {
  buildDirectorSystemPrompt,
  buildDirectorUserText,
  parseDirectorConcepts,
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
    expect(s).toContain("Design 3 DISTINCT fusion concepts");
    expect(s).toContain('{"concepts"');
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

describe("parseDirectorConcepts", () => {
  it("纯 JSON", () => {
    const r = parseDirectorConcepts(JSON.stringify({ concepts: [CONCEPT] }));
    expect(r).toEqual([CONCEPT]);
  });

  it("容忍 ```json 围栏与前后杂文", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify({ concepts: [CONCEPT] }) + "\n```\nEnjoy!";
    expect(parseDirectorConcepts(text)).toEqual([CONCEPT]);
  });

  it("容忍无围栏的前置说明文字", () => {
    const text = "Sure! " + JSON.stringify({ concepts: [CONCEPT] });
    expect(parseDirectorConcepts(text)).toEqual([CONCEPT]);
  });

  it("过滤结构不合法的条目；全废时返回 null", () => {
    const mixed = JSON.stringify({ concepts: [{ name: "x", prompt: "too short" }, CONCEPT] });
    expect(parseDirectorConcepts(mixed)).toEqual([CONCEPT]);
    expect(parseDirectorConcepts(JSON.stringify({ concepts: [{ name: "x" }] }))).toBeNull();
    expect(parseDirectorConcepts(JSON.stringify({ nope: 1 }))).toBeNull();
    expect(parseDirectorConcepts("not json at all")).toBeNull();
  });
});
