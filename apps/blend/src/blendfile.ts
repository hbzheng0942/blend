import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { BlendManifest, Tree } from "@blend/core";
import { buildManifest, manifestImageHashes, uuid, validateManifest } from "@blend/core";
import { getStorage } from "./storage";

/** `.blend` 导出：zip = manifest.json + images/<hash>.png（PRD 3.4，跨设备迁移方案）。 */
export async function exportTreeToBlendFile(treeId: string): Promise<void> {
  const s = getStorage();
  const tree = await s.getTree(treeId);
  if (!tree) throw new Error("tree not found");
  const [nodes, elements] = await Promise.all([s.getNodes(treeId), s.getElements(treeId)]);
  const manifest = buildManifest(tree, nodes, elements);

  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 1)),
  };
  for (const hash of manifestImageHashes(manifest)) {
    const blob = await s.getBlob(hash);
    if (blob) files["images/" + hash + ".png"] = new Uint8Array(await blob.arrayBuffer());
  }
  // 图片本身已是压缩格式，store 即可
  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (tree.title.replace(/[\\/:*?"<>|]/g, "_") || "tree") + ".blend";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** `.blend` 导入：解包校验后整树入库；树 id 冲突时换新 id（不覆盖已有数据）。 */
export async function importBlendFile(file: File): Promise<Tree> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new Error("不是有效的 .blend 文件（缺 manifest.json）");
  const manifest = JSON.parse(strFromU8(manifestRaw)) as BlendManifest;
  const err = validateManifest(manifest);
  if (err) throw new Error("导入校验失败：" + err);

  const s = getStorage();
  for (const [path, data] of Object.entries(files)) {
    const m = /^images\/([0-9a-f]{64})\.png$/.exec(path);
    if (m && !(await s.hasBlob(m[1]!))) {
      await s.putBlob(m[1]!, new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/png" }));
    }
  }

  let tree = manifest.tree;
  if (await s.getTree(tree.id)) {
    tree = { ...tree, id: uuid(), title: tree.title + "（导入副本）" };
  }
  tree = { ...tree, updatedAt: Date.now() };
  await s.putTree(tree);
  for (const n of manifest.nodes) await s.putNode(tree.id, n);
  for (const e of manifest.elements) await s.putElement(tree.id, e);
  return tree;
}

// dev-only：暴露便于控制台调试/E2E 驱动
declare const __DEV__: boolean | undefined;
if (typeof __DEV__ !== "undefined" && __DEV__ && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__blendfile = { exportTreeToBlendFile, importBlendFile };
}

/** web 端 .blend 文件选择。 */
export function pickBlendFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".blend,application/zip";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    window.addEventListener("focus", () => setTimeout(() => resolve(null), 300), { once: true });
    input.click();
  });
}
