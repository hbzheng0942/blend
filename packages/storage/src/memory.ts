import type { BlendNode, Element, Tree } from "@blend/core";
import type { StorageAdapter } from "./adapter";

/** 内存实现：单测与 SSR 兜底用。 */
export function createMemoryAdapter(): StorageAdapter {
  const blobs = new Map<string, Blob | Uint8Array>();
  const trees = new Map<string, Tree>();
  const nodes = new Map<string, Map<string, BlendNode>>();
  const elements = new Map<string, Map<string, Element>>();

  const bucket = <T>(m: Map<string, Map<string, T>>, treeId: string) => {
    let b = m.get(treeId);
    if (!b) {
      b = new Map();
      m.set(treeId, b);
    }
    return b;
  };

  return {
    async putBlob(hash, data) {
      blobs.set(hash, data);
    },
    async getBlob(hash) {
      const v = blobs.get(hash);
      if (!v) return null;
      return v instanceof Blob ? v : new Blob([v as Uint8Array<ArrayBuffer>]);
    },
    async hasBlob(hash) {
      return blobs.has(hash);
    },
    async putTree(tree) {
      trees.set(tree.id, tree);
    },
    async getTree(id) {
      return trees.get(id) ?? null;
    },
    async listTrees() {
      return [...trees.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async deleteTree(id) {
      trees.delete(id);
      nodes.delete(id);
      elements.delete(id);
    },
    async putNode(treeId, node) {
      bucket(nodes, treeId).set(node.id, node);
    },
    async getNodes(treeId) {
      return [...bucket(nodes, treeId).values()];
    },
    async putElement(treeId, element) {
      bucket(elements, treeId).set(element.id, element);
    },
    async getElements(treeId) {
      return [...bucket(elements, treeId).values()];
    },
  };
}
