import type { BlendNode, Element, Tree } from "@blend/core";

/**
 * 双端一致的存储抽象（PRD 3.4，DECISION LOCKED）：
 * web = IndexedDB；iOS = expo-sqlite + 文件系统（Phase 3 实现）。
 * 图片 blob 以 sha256 hash 为键内容寻址，全局去重。
 */
export interface StorageAdapter {
  // blob store
  putBlob(hash: string, data: Blob | Uint8Array): Promise<void>;
  getBlob(hash: string): Promise<Blob | null>;
  hasBlob(hash: string): Promise<boolean>;

  // trees
  putTree(tree: Tree): Promise<void>;
  getTree(id: string): Promise<Tree | null>;
  listTrees(): Promise<Tree[]>;
  deleteTree(id: string): Promise<void>;

  // nodes / elements（按树分区）
  putNode(treeId: string, node: BlendNode): Promise<void>;
  getNodes(treeId: string): Promise<BlendNode[]>;
  putElement(treeId: string, element: Element): Promise<void>;
  getElements(treeId: string): Promise<Element[]>;
}
