import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  downstreamNodeIds,
  forgeInputHashes,
  isNodeStale,
  recastInputHashes,
  runCascade,
  sha256Hex,
  uuid,
  type BlendNode,
  type Recipe,
  type StepRunner,
} from "../src";

function mkNode(
  id: string,
  partial: Omit<Partial<BlendNode>, "recipe"> & { recipe?: Partial<Recipe> } = {},
): BlendNode {
  return {
    id,
    createdAt: 0,
    canonicalOutputId:
      partial.canonicalOutputId !== undefined ? partial.canonicalOutputId : `${id}-out`,
    outputs: partial.outputs ?? [
      {
        id: `${id}-out`,
        imageHash: `hash-${id}`,
        executionPlan: [],
        providerId: "p",
        modelId: "m",
        finalPrompt: "",
      },
    ],
    recipe: {
      parentNodeIds: [],
      elementIds: [],
      operator: "fuse",
      styleTags: [],
      mode: "forge",
      ...partial.recipe,
    },
  };
}

const reader = (nodes: BlendNode[]) => ({
  getNode: (id: string) => nodes.find((n) => n.id === id),
});

describe("buildPrompt", () => {
  it("组装 操作符骨架 + 风格 + 自由补充", () => {
    const p = buildPrompt({
      parentNodeIds: [],
      elementIds: [],
      operator: "fuse",
      styleTags: ["cyberpunk", "clay-render"],
      userPromptExtra: "make it tiny",
      mode: "forge",
    });
    expect(p).toContain("Seamlessly fuse");
    expect(p).toContain("cyberpunk");
    expect(p).toContain("clay 3D render");
    expect(p.endsWith("make it tiny")).toBe(true);
  });

  it("风格最多取 3 个，未知 tag 忽略", () => {
    const p = buildPrompt({
      parentNodeIds: [],
      elementIds: [],
      operator: "fuse",
      styleTags: ["ceramic", "y2k", "voxel", "photoreal", "nope"],
      mode: "forge",
    });
    expect(p).toContain("ceramic");
    expect(p).toContain("voxel");
    expect(p).not.toContain("photorealistic");
  });

  it("支持 per-model override", () => {
    const p = buildPrompt(
      { parentNodeIds: [], elementIds: [], operator: "inject", styleTags: [], mode: "forge" },
      { inject: "OVERRIDE" },
    );
    expect(p).toBe("OVERRIDE");
  });
});

describe("lineage", () => {
  const elemHash = (id: string) => `ehash-${id}`;

  it("forge：parents canonical 输出 + 新增要素", () => {
    const a = mkNode("a");
    const recipe: Recipe = {
      parentNodeIds: ["a"], elementIds: ["e1"], operator: "fuse", styleTags: [], mode: "forge",
    };
    expect(forgeInputHashes(recipe, reader([a]), elemHash)).toEqual(["hash-a", "ehash-e1"]);
  });

  it("forge：canonical 缺失时报错", () => {
    const a = mkNode("a", { canonicalOutputId: null });
    const recipe: Recipe = {
      parentNodeIds: ["a"], elementIds: [], operator: "fuse", styleTags: [], mode: "forge",
    };
    expect(() => forgeInputHashes(recipe, reader([a]), elemHash)).toThrow(/canonical/);
  });

  it("recast：上溯收集全部原始要素并去重", () => {
    const root = mkNode("root", { recipe: { elementIds: ["e1", "e2"] } });
    const mid = mkNode("mid", { recipe: { parentNodeIds: ["root"], elementIds: ["e3", "e1"] } });
    const recipe: Recipe = {
      parentNodeIds: ["mid"], elementIds: ["e4"], operator: "fuse", styleTags: [], mode: "recast",
    };
    expect(recastInputHashes(recipe, reader([root, mid]), elemHash)).toEqual([
      "ehash-e1", "ehash-e2", "ehash-e3", "ehash-e4",
    ]);
  });

  it("recast：merge 双 parent 汇总", () => {
    const a = mkNode("a", { recipe: { elementIds: ["e1"] } });
    const b = mkNode("b", { recipe: { elementIds: ["e2"] } });
    const recipe: Recipe = {
      parentNodeIds: ["a", "b"], elementIds: [], operator: "fuse", styleTags: [], mode: "recast",
    };
    expect(recastInputHashes(recipe, reader([a, b]), elemHash)).toEqual(["ehash-e1", "ehash-e2"]);
  });

  it("downstream：BFS 找出全部下游（含分叉），不含无关节点", () => {
    const a = mkNode("a");
    const b = mkNode("b", { recipe: { parentNodeIds: ["a"] } });
    const c = mkNode("c", { recipe: { parentNodeIds: ["b"] } });
    const d = mkNode("d", { recipe: { parentNodeIds: ["a"] } });
    const x = mkNode("x");
    const ids = downstreamNodeIds("a", [a, b, c, d, x]);
    expect(new Set(ids)).toEqual(new Set(["b", "c", "d"]));
  });
});

describe("runCascade", () => {
  function runner(max: number, log: string[][]): StepRunner {
    let i = 0;
    return {
      providerId: "p",
      modelId: "m",
      maxInputImages: max,
      runStep: async (inputs) => {
        log.push([...inputs]);
        return `mid-${++i}`;
      },
    };
  }

  it("不超上限：单步直出", async () => {
    const log: string[][] = [];
    const r = await runCascade(["1", "2", "3"], "p", runner(6, log));
    expect(r.executionPlan).toHaveLength(1);
    expect(r.outputHash).toBe("mid-1");
    expect(log).toEqual([["1", "2", "3"]]);
  });

  it("超上限：分批级联，中间结果作为下一批首图", async () => {
    const log: string[][] = [];
    const inputs = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const r = await runCascade(inputs, "p", runner(6, log));
    expect(log).toEqual([
      ["1", "2", "3", "4", "5", "6"],
      ["mid-1", "7", "8"],
    ]);
    expect(r.outputHash).toBe("mid-2");
    expect(r.executionPlan).toHaveLength(2);
    expect(r.executionPlan[1]!.inputHashes[0]).toBe("mid-1");
  });

  it("极端：max=2 时逐张级联", async () => {
    const log: string[][] = [];
    const r = await runCascade(["1", "2", "3", "4"], "p", runner(2, log));
    expect(log).toEqual([["1", "2"], ["mid-1", "3"], ["mid-2", "4"]]);
    expect(r.outputHash).toBe("mid-3");
  });

  it("空输入报错", async () => {
    await expect(runCascade([], "p", runner(6, []))).rejects.toThrow();
  });
});

describe("ids", () => {
  it("uuid 形状正确且不重复", () => {
    const a = uuid();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(uuid()).not.toBe(a);
  });

  it("sha256 与 node:crypto 一致", async () => {
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update("blend").digest("hex");
    expect(await sha256Hex(new TextEncoder().encode("blend"))).toBe(expected);
  });
});

describe("isNodeStale", () => {
  const mkNode = (id: string, parents: string[], inputHashes: string[], outHash: string): BlendNode => ({
    id,
    recipe: { parentNodeIds: parents, elementIds: [], operator: "fuse", styleTags: [], mode: "forge" },
    outputs: [{
      id: id + "-o1", imageHash: outHash, providerId: "agnes", modelId: "m", finalPrompt: "p",
      executionPlan: [{ inputHashes, prompt: "p", outputHash: outHash, providerId: "agnes", modelId: "m" }],
    }],
    canonicalOutputId: id + "-o1",
    createdAt: 0,
  });

  it("parent 改选 canonical 后下游变 stale，根节点永不 stale", () => {
    const parent = mkNode("p", [], ["e1"], "hashA");
    parent.outputs.push({
      id: "p-o2", imageHash: "hashB", providerId: "agnes", modelId: "m", finalPrompt: "p",
      executionPlan: [{ inputHashes: ["e1"], prompt: "p", outputHash: "hashB", providerId: "agnes", modelId: "m" }],
    });
    const child = mkNode("c", ["p"], ["hashA"], "hashC");
    const reader = { getNode: (id: string) => ({ p: parent, c: child } as Record<string, BlendNode>)[id] };

    expect(isNodeStale(parent, reader)).toBe(false);
    expect(isNodeStale(child, reader)).toBe(false);
    parent.canonicalOutputId = "p-o2"; // 改选
    expect(isNodeStale(child, reader)).toBe(true);
  });
});
