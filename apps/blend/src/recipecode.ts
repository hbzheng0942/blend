import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { RecipePlan, Tree } from "@blend/core";
import { RECIPE_CODE_PREFIX, buildRecipePlan, uuid, validateRecipePlan } from "@blend/core";
import { getStorage } from "./storage";

/**
 * 配方码 app 层：plan JSON → deflate → base64url，前缀 BLEND1.
 * 短文本码可直接复制/粘贴分享；二维码内容即此字符串。
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeRecipeCode(plan: RecipePlan): string {
  return RECIPE_CODE_PREFIX + toBase64Url(deflateSync(strToU8(JSON.stringify(plan)), { level: 9 }));
}

export function decodeRecipeCode(code: string): RecipePlan {
  const trimmed = code.trim();
  if (!trimmed.startsWith(RECIPE_CODE_PREFIX)) throw new Error("不是 Blend 配方码（缺 BLEND1. 前缀）");
  let plan: unknown;
  try {
    plan = JSON.parse(strFromU8(inflateSync(fromBase64Url(trimmed.slice(RECIPE_CODE_PREFIX.length)))));
  } catch {
    throw new Error("配方码已损坏，无法解码");
  }
  const err = validateRecipePlan(plan);
  if (err) throw new Error("配方码校验失败：" + err);
  return plan as RecipePlan;
}

/** 从已有树的某个节点生成配方码。 */
export async function exportRecipeCode(treeId: string, nodeId: string): Promise<string> {
  const s = getStorage();
  const tree = await s.getTree(treeId);
  if (!tree) throw new Error("tree not found");
  const [nodes, elements] = await Promise.all([s.getNodes(treeId), s.getElements(treeId)]);
  return encodeRecipeCode(buildRecipePlan(tree, nodes, elements, nodeId));
}

/**
 * 导入配方码：建一棵空树，plan 挂在 tree.importedPlan 上。
 * 用户在锻造台按 plan 指引投入自己的图逐步重演绎（"同一配方不同结果"）。
 */
export async function importRecipeCode(code: string): Promise<Tree> {
  const plan = decodeRecipeCode(code);
  const now = Date.now();
  const tree: Tree = {
    id: uuid(),
    title: plan.t + "（重演绎）",
    rootElementIds: [],
    nodeIds: [],
    canvasLayout: {},
    importedPlan: plan,
    createdAt: now,
    updatedAt: now,
  };
  await getStorage().putTree(tree);
  return tree;
}
