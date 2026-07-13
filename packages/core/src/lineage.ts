import type { BlendNode, Recipe } from "./types";

/** 节点仓库的最小读接口（storage 层与内存实现都满足）。 */
export interface NodeReader {
  getNode(id: string): BlendNode | undefined;
}

/** forge 模式的输入：parents 的 canonical 输出 hash + 本轮新增要素 hash。 */
export function forgeInputHashes(
  recipe: Recipe,
  nodes: NodeReader,
  elementHash: (elementId: string) => string,
): string[] {
  const parentHashes = recipe.parentNodeIds.map((pid) => {
    const n = nodes.getNode(pid);
    if (!n) throw new Error(`parent node not found: ${pid}`);
    const out = n.outputs.find((o) => o.id === n.canonicalOutputId);
    if (!out) throw new Error(`node ${pid} has no canonical output`);
    return out.imageHash;
  });
  return [...parentHashes, ...recipe.elementIds.map(elementHash)];
}

/**
 * recast 模式的输入：沿谱系上溯收集全部原始要素（去重，保持发现顺序）+ 本轮新增。
 */
export function recastInputHashes(
  recipe: Recipe,
  nodes: NodeReader,
  elementHash: (elementId: string) => string,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const visit = (nodeId: string) => {
    const n = nodes.getNode(nodeId);
    if (!n) throw new Error(`node not found: ${nodeId}`);
    n.recipe.parentNodeIds.forEach(visit);
    for (const eid of n.recipe.elementIds) {
      if (!seen.has(eid)) {
        seen.add(eid);
        ordered.push(eid);
      }
    }
  };
  recipe.parentNodeIds.forEach(visit);
  for (const eid of recipe.elementIds) {
    if (!seen.has(eid)) {
      seen.add(eid);
      ordered.push(eid);
    }
  }
  return ordered.map(elementHash);
}

/** 改选 canonical 后，找出所有需要标记 stale 的下游节点。 */
export function downstreamNodeIds(changedNodeId: string, all: BlendNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const n of all) {
    for (const p of n.recipe.parentNodeIds) {
      const arr = children.get(p) ?? [];
      arr.push(n.id);
      children.set(p, arr);
    }
  }
  const out: string[] = [];
  const queue = [...(children.get(changedNodeId) ?? [])];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const c of children.get(id) ?? []) {
      if (!seen.has(c)) {
        seen.add(c);
        queue.push(c);
      }
    }
  }
  return out;
}

/**
 * stale 派生判定（不落库）：某个 parent 改选 canonical 后，
 * 若其当前 canonical hash 不在本节点 executionPlan 的输入 hash 里，则本节点已过时。
 */
export function isNodeStale(node: BlendNode, nodes: NodeReader): boolean {
  if (node.recipe.parentNodeIds.length === 0 || node.outputs.length === 0) return false;
  const usedInputs = new Set(
    node.outputs.flatMap((o) => o.executionPlan.flatMap((s) => s.inputHashes)),
  );
  return node.recipe.parentNodeIds.some((pid) => {
    const p = nodes.getNode(pid);
    const canonical = p?.outputs.find((o) => o.id === p.canonicalOutputId);
    return canonical ? !usedInputs.has(canonical.imageHash) : false;
  });
}
