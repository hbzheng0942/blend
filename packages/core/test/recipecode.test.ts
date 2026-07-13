import { describe, expect, it } from "vitest";
import {
  RECIPE_CODE_VERSION,
  buildRecipePlan,
  validateRecipePlan,
  type BlendNode,
  type Element,
  type Recipe,
  type Tree,
} from "../src";

const el = (id: string, label?: string): Element => ({
  id,
  imageHash: `sha-${id}-0123456789abcdef`,
  source: "upload",
  createdAt: 0,
  ...(label ? { meta: { label } } : {}),
});

function mkNode(id: string, recipe: Partial<Recipe>, conceptName?: string): BlendNode {
  return {
    id,
    createdAt: 0,
    canonicalOutputId: `${id}-out`,
    outputs: [
      {
        id: `${id}-out`, imageHash: `hash-${id}`, executionPlan: [],
        providerId: "agnes", modelId: "m", finalPrompt: `prompt-${id}`,
        ...(conceptName ? { conceptName } : {}),
      },
    ],
    recipe: {
      parentNodeIds: [], elementIds: [], operator: "fuse", styleTags: [], mode: "forge",
      ...recipe,
    },
  };
}

const tree: Tree = {
  id: "t", title: "八爪茶壶", rootElementIds: [], nodeIds: [],
  canvasLayout: {}, createdAt: 0, updatedAt: 0,
};

describe("buildRecipePlan", () => {
  it("上溯 recipe 链：parent 用步骤下标，要素去重进 e 表", () => {
    const elements = [el("e1", "茶壶"), el("e2"), el("e3")];
    const nodes = [
      mkNode("n1", { elementIds: ["e1", "e2"] }, "Ceramic Cephalopod"),
      mkNode("n2", { parentNodeIds: ["n1"], elementIds: ["e3"], operator: "inject", styleTags: ["y2k"] }),
      // 旁支：不在 n2 血统上，不应入 plan
      mkNode("nX", { elementIds: ["e1"] }),
    ];
    const plan = buildRecipePlan(tree, nodes, elements, "n2");
    expect(plan.v).toBe(RECIPE_CODE_VERSION);
    expect(plan.t).toBe("八爪茶壶");
    expect(plan.e).toEqual([
      { h: elements[0]!.imageHash.slice(0, 12), label: "茶壶" },
      { h: elements[1]!.imageHash.slice(0, 12) },
      { h: elements[2]!.imageHash.slice(0, 12) },
    ]);
    expect(plan.s).toHaveLength(2);
    expect(plan.s[0]).toMatchObject({ p: [], e: [0, 1], o: "fuse", n: "Ceramic Cephalopod", fp: "prompt-n1" });
    expect(plan.s[1]).toMatchObject({ p: [0], e: [2], o: "inject", s: ["y2k"] });
    expect(validateRecipePlan(plan)).toBeNull();
  });

  it("merge：两 parent 汇入一步", () => {
    const elements = [el("e1"), el("e2")];
    const nodes = [
      mkNode("a", { elementIds: ["e1"] }),
      mkNode("b", { elementIds: ["e2"] }),
      mkNode("m", { parentNodeIds: ["a", "b"], operator: "absorb" }),
    ];
    const plan = buildRecipePlan(tree, nodes, elements, "m");
    expect(plan.s[2]).toMatchObject({ p: [0, 1], e: [], o: "absorb" });
    expect(validateRecipePlan(plan)).toBeNull();
  });
});

describe("validateRecipePlan", () => {
  const good = () => ({
    v: RECIPE_CODE_VERSION, t: "x",
    e: [{ h: "abc" }],
    s: [{ p: [] as number[], e: [0], o: "fuse", s: [] as string[], m: "forge" }],
  });

  it("通过合法 plan", () => expect(validateRecipePlan(good())).toBeNull());
  it("拒绝版本不符", () => expect(validateRecipePlan({ ...good(), v: 99 })).toMatch(/版本/));
  it("拒绝 parent 前向引用", () => {
    const p = good();
    p.s[0]!.p = [0];
    expect(validateRecipePlan(p)).toMatch(/parent/);
  });
  it("拒绝要素越界", () => {
    const p = good();
    p.s[0]!.e = [5];
    expect(validateRecipePlan(p)).toMatch(/越界/);
  });
  it("拒绝空输入步骤", () => {
    const p = good();
    p.s[0]!.e = [];
    expect(validateRecipePlan(p)).toMatch(/没有任何输入/);
  });
});
