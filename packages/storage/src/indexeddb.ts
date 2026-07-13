import { openDB, type IDBPDatabase } from "idb";
import type { BlendNode, Element, Tree } from "@blend/core";
import type { StorageAdapter } from "./adapter";

const DB_NAME = "blend";
const DB_VERSION = 2;

interface Stores {
  blobs: Blob | Uint8Array;
  trees: Tree;
  nodes: BlendNode & { treeId: string };
  elements: Element & { treeId: string };
}

function open(name: string): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("trees")) db.createObjectStore("trees", { keyPath: "id" });
      // v2：nodes/elements 复合主键 [treeId, id]。v1 用全局 id 作主键，
      // 导入的树副本与原树节点 id 相同，会互相覆盖抢数据（按树分区失效）。
      // v1 未发布无真实用户数据，直接重建不做迁移。
      for (const store of ["nodes", "elements"] as const) {
        if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store);
        db.createObjectStore(store, { keyPath: ["treeId", "id"] }).createIndex("byTree", "treeId");
      }
    },
  });
}

export function createIndexedDbAdapter(dbName: string = DB_NAME): StorageAdapter {
  const dbp = open(dbName);

  return {
    async putBlob(hash, data) {
      const db = await dbp;
      await db.put("blobs", data, hash);
    },
    async getBlob(hash) {
      const db = await dbp;
      const v = (await db.get("blobs", hash)) as Stores["blobs"] | undefined;
      if (!v) return null;
      return v instanceof Blob ? v : new Blob([v as Uint8Array<ArrayBuffer>]);
    },
    async hasBlob(hash) {
      const db = await dbp;
      return (await db.getKey("blobs", hash)) !== undefined;
    },

    async putTree(tree) {
      const db = await dbp;
      await db.put("trees", tree);
    },
    async getTree(id) {
      const db = await dbp;
      return ((await db.get("trees", id)) as Tree | undefined) ?? null;
    },
    async listTrees() {
      const db = await dbp;
      const all = (await db.getAll("trees")) as Tree[];
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async deleteTree(id) {
      const db = await dbp;
      const tx = db.transaction(["trees", "nodes", "elements"], "readwrite");
      await tx.objectStore("trees").delete(id);
      for (const store of ["nodes", "elements"] as const) {
        const idx = tx.objectStore(store).index("byTree");
        for (const key of await idx.getAllKeys(id)) {
          await tx.objectStore(store).delete(key);
        }
      }
      await tx.done;
    },

    async putNode(treeId, node) {
      const db = await dbp;
      await db.put("nodes", { ...node, treeId });
    },
    async getNodes(treeId) {
      const db = await dbp;
      const rows = (await db.getAllFromIndex("nodes", "byTree", treeId)) as Stores["nodes"][];
      return rows.map(({ treeId: _t, ...n }) => n as BlendNode);
    },
    async putElement(treeId, element) {
      const db = await dbp;
      await db.put("elements", { ...element, treeId });
    },
    async getElements(treeId) {
      const db = await dbp;
      const rows = (await db.getAllFromIndex("elements", "byTree", treeId)) as Stores["elements"][];
      return rows.map(({ treeId: _t, ...e }) => e as Element);
    },
  };
}
