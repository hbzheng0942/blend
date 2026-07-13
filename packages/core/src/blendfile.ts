import type { BlendNode, Element, Tree } from "./types";

/**
 * `.blend` 文件（PRD 3.4）：zip 包 = manifest.json + images/<hash>.png。
 * 本模块只负责 manifest 的构建与校验（纯数据，零依赖）；
 * zip 打包/解包由 app 层用 fflate 完成。
 */

export const BLEND_FILE_VERSION = 1;

export interface BlendManifest {
  version: number;
  exportedAt: number;
  tree: Tree;
  nodes: BlendNode[];
  elements: Element[];
}

/** 导出需要打包的全部图片 hash（要素 + 所有候选 + 级联中间产物，去重）。 */
export function manifestImageHashes(m: Pick<BlendManifest, "nodes" | "elements">): string[] {
  const set = new Set<string>();
  for (const el of m.elements) set.add(el.imageHash);
  for (const n of m.nodes) {
    for (const o of n.outputs) {
      set.add(o.imageHash);
      for (const step of o.executionPlan) {
        step.inputHashes.forEach((h) => set.add(h));
        set.add(step.outputHash);
      }
    }
  }
  return [...set];
}

export function buildManifest(tree: Tree, nodes: BlendNode[], elements: Element[]): BlendManifest {
  return { version: BLEND_FILE_VERSION, exportedAt: Date.now(), tree, nodes, elements };
}

/** 导入前的结构校验；返回错误消息，null = 通过。 */
export function validateManifest(raw: unknown): string | null {
  const m = raw as Partial<BlendManifest> | null;
  if (!m || typeof m !== "object") return "manifest 不是对象";
  if (m.version !== BLEND_FILE_VERSION) return `不支持的版本：${String(m.version)}`;
  if (!m.tree?.id || !Array.isArray(m.tree.nodeIds)) return "tree 结构缺失";
  if (!Array.isArray(m.nodes) || !Array.isArray(m.elements)) return "nodes/elements 缺失";
  for (const n of m.nodes) {
    if (!n.id || !n.recipe || !Array.isArray(n.outputs)) return "node 结构损坏：" + String(n?.id);
  }
  for (const e of m.elements) {
    if (!e.id || !e.imageHash) return "element 结构损坏：" + String(e?.id);
  }
  return null;
}
