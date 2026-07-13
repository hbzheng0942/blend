import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { StorageAdapter } from "../src";
import { createIndexedDbAdapter, createMemoryAdapter } from "../src";
import type { BlendNode, Tree } from "@blend/core";

const mkTree = (id: string, updatedAt = 0): Tree => ({
  id,
  title: "t" + id,
  rootElementIds: [],
  nodeIds: [],
  canvasLayout: {},
  createdAt: 0,
  updatedAt,
});

const mkNode = (id: string): BlendNode => ({
  id,
  recipe: { parentNodeIds: [], elementIds: [], operator: "fuse", styleTags: [], mode: "forge" },
  outputs: [],
  canonicalOutputId: null,
  createdAt: 0,
});

// 双实现跑同一套契约测试。indexeddb 每用例用独立库名：
// 复用同名库需要先 deleteDatabase，而上一用例的连接未关会让删除请求
// 永久 blocked，后续 open 排队挂死（真实浏览器与 fake-indexeddb 行为一致）。
let dbSeq = 0;
const impls: Array<[string, () => StorageAdapter]> = [
  ["memory", createMemoryAdapter],
  ["indexeddb", () => createIndexedDbAdapter(`blend-test-${++dbSeq}`)],
];

for (const [name, create] of impls) {
  describe(`StorageAdapter (${name})`, () => {
    let s: StorageAdapter;
    beforeEach(async () => {
      s = create();
    });

    it("blob 存取与去重判断", async () => {
      expect(await s.hasBlob("h1")).toBe(false);
      await s.putBlob("h1", new Uint8Array([1, 2, 3]));
      expect(await s.hasBlob("h1")).toBe(true);
      const b = await s.getBlob("h1");
      expect(b).not.toBeNull();
      expect(new Uint8Array(await b!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
      expect(await s.getBlob("nope")).toBeNull();
    });

    it("tree CRUD，list 按 updatedAt 倒序", async () => {
      await s.putTree(mkTree("a", 1));
      await s.putTree(mkTree("b", 5));
      expect((await s.listTrees()).map((t) => t.id)).toEqual(["b", "a"]);
      expect((await s.getTree("a"))?.title).toBe("ta");
      await s.deleteTree("a");
      expect(await s.getTree("a")).toBeNull();
      expect((await s.listTrees()).map((t) => t.id)).toEqual(["b"]);
    });

    it("node/element 按树分区，deleteTree 级联清理", async () => {
      await s.putTree(mkTree("t1"));
      await s.putNode("t1", mkNode("n1"));
      await s.putNode("t2", mkNode("n2"));
      await s.putElement("t1", {
        id: "e1", imageHash: "h", source: "upload", createdAt: 0,
      });
      expect((await s.getNodes("t1")).map((n) => n.id)).toEqual(["n1"]);
      expect((await s.getNodes("t2")).map((n) => n.id)).toEqual(["n2"]);
      expect(await s.getElements("t1")).toHaveLength(1);

      await s.deleteTree("t1");
      expect(await s.getNodes("t1")).toHaveLength(0);
      expect(await s.getElements("t1")).toHaveLength(0);
      expect((await s.getNodes("t2")).map((n) => n.id)).toEqual(["n2"]);
    });

    it("putNode 覆盖更新（canonize 场景）", async () => {
      await s.putNode("t1", mkNode("n1"));
      await s.putNode("t1", { ...mkNode("n1"), canonicalOutputId: "o9" });
      const nodes = await s.getNodes("t1");
      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.canonicalOutputId).toBe("o9");
    });
  });
}

describe("跨树分区隔离（v2 复合主键回归）", () => {
  for (const [name, create] of impls) {
    it(`两棵树可持有相同 id 的节点而互不覆盖 (${name})`, async () => {
      const s = create();
      const node = mkNode("shared-node-id");
      await s.putNode("tree-A", node);
      await s.putNode("tree-B", node);
      expect((await s.getNodes("tree-A")).length).toBe(1);
      expect((await s.getNodes("tree-B")).length).toBe(1);
    });
  }
});
