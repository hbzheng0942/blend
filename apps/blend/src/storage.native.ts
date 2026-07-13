import { Directory, File, Paths } from "expo-file-system";
import type { BlendNode, Element, Tree } from "@blend/core";
import type { StorageAdapter } from "@blend/storage";

/**
 * iOS/Android 存储适配器：expo-file-system 文件桶（Metro 平台后缀分流，web 走 IndexedDB）。
 *   blend/blobs/<hash>.png                 图片（内容寻址）
 *   blend/trees/<treeId>.json              树元数据
 *   blend/nodes/<treeId>/<nodeId>.json     节点
 *   blend/elements/<treeId>/<elId>.json    要素
 * 数据量级（单树 ≤ 百节点）下文件桶足够；不引 sqlite。
 */

const root = new Directory(Paths.document, "blend");

function dir(...parts: string[]): Directory {
  const d = new Directory(root, ...parts);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

const readJson = <T>(f: File): T | null => (f.exists ? (JSON.parse(f.textSync()) as T) : null);

function listJson<T>(d: Directory): T[] {
  if (!d.exists) return [];
  return d.list()
    .filter((e): e is File => e instanceof File && e.name.endsWith(".json"))
    .map((f) => JSON.parse(f.textSync()) as T);
}

export function getStorage(): StorageAdapter {
  return {
    async putBlob(hash, data) {
      const f = new File(dir("blobs"), hash + ".png");
      if (data instanceof Uint8Array) {
        f.write(data);
      } else {
        f.write(new Uint8Array(await data.arrayBuffer()));
      }
    },
    async getBlob(hash) {
      const f = new File(dir("blobs"), hash + ".png");
      if (!f.exists) return null;
      return new Blob([f.bytesSync() as Uint8Array<ArrayBuffer>], { type: "image/png" });
    },
    async hasBlob(hash) {
      return new File(dir("blobs"), hash + ".png").exists;
    },
    async putTree(tree) {
      new File(dir("trees"), tree.id + ".json").write(JSON.stringify(tree));
    },
    async getTree(id) {
      return readJson<Tree>(new File(dir("trees"), id + ".json"));
    },
    async listTrees() {
      return listJson<Tree>(dir("trees")).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async deleteTree(id) {
      const f = new File(dir("trees"), id + ".json");
      if (f.exists) f.delete();
      for (const sub of ["nodes", "elements"]) {
        const d = new Directory(root, sub, id);
        if (d.exists) d.delete();
      }
    },
    async putNode(treeId, node) {
      new File(dir("nodes", treeId), node.id + ".json").write(JSON.stringify(node));
    },
    async getNodes(treeId) {
      return listJson<BlendNode>(dir("nodes", treeId)).sort((a, b) => a.createdAt - b.createdAt);
    },
    async putElement(treeId, element) {
      new File(dir("elements", treeId), element.id + ".json").write(JSON.stringify(element));
    },
    async getElements(treeId) {
      return listJson<Element>(dir("elements", treeId)).sort((a, b) => a.createdAt - b.createdAt);
    },
  };
}

/** native 专用：hash → 可直接渲染的 file:// URI（blobs.native.ts 用）。 */
export function blobFileUri(hash: string): string | null {
  const f = new File(dir("blobs"), hash + ".png");
  return f.exists ? f.uri : null;
}
