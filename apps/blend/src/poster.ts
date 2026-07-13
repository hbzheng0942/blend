import type { BlendNode, Tree } from "@blend/core";
import { OPERATORS, STYLE_TAGS } from "@blend/core";
import { blobUrl } from "./blobs";

/**
 * 卡面海报导出（web）：canvas 2D 把 canonical 输出排成收藏卡。
 * 版式与 app 同一基调：暖黑纸面、衬线标题、kicker 注记、熔金细节线。
 */

const W = 1200;
const H = 1560;
const PAD = 90;

export async function exportPoster(tree: Tree, node: BlendNode, versionLabel: string): Promise<void> {
  const canonical = node.outputs.find((o) => o.id === node.canonicalOutputId);
  if (!canonical) throw new Error("节点还没有入谱产物");
  const url = await blobUrl(canonical.imageHash);
  if (!url) throw new Error("图像缺失");

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 纸面
  ctx.fillStyle = "#0f0d0b";
  ctx.fillRect(0, 0, W, H);

  // 主图 + 发丝框
  const imgSize = W - PAD * 2;
  ctx.fillStyle = "#1d1915";
  ctx.fillRect(PAD - 1, PAD - 1, imgSize + 2, imgSize + 2);
  ctx.drawImage(img, PAD, PAD, imgSize, imgSize);
  ctx.strokeStyle = "rgba(237,230,218,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD - 0.5, PAD - 0.5, imgSize + 1, imgSize + 1);

  const op = OPERATORS.find((o) => o.id === node.recipe.operator);
  let y = PAD + imgSize + 96;

  // kicker
  ctx.fillStyle = "#93887a";
  ctx.font = "600 24px Georgia, serif";
  const styleNames = node.recipe.styleTags
    .map((t) => STYLE_TAGS.find((s) => s.id === t)?.nameZh)
    .filter(Boolean)
    .join(" + ");
  ctx.fillText(
    `${versionLabel.toUpperCase()} · ${op?.nameZh ?? ""}${node.recipe.mode === "recast" ? " · 重铸" : ""}${styleNames ? " · " + styleNames : ""}`,
    PAD, y,
  );

  // 标题（衬线）：director 命名优先，树名退居副题
  y += 78;
  ctx.fillStyle = "#ede6da";
  ctx.font = "56px Georgia, 'Songti SC', serif";
  ctx.fillText(canonical.conceptName ?? tree.title, PAD, y);
  if (canonical.conceptName) {
    y += 40;
    ctx.fillStyle = "#93887a";
    ctx.font = "26px Georgia, 'Songti SC', serif";
    ctx.fillText(tree.title, PAD, y);
  }

  // 熔金细节线
  y += 44;
  ctx.strokeStyle = "#e08e45";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PAD + 120, y);
  ctx.stroke();

  // 操作符大印记（右下，衬线熔金）
  ctx.fillStyle = "rgba(224,142,69,0.85)";
  ctx.font = "120px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillText(op?.symbol ?? "⊕", W - PAD, H - PAD + 10);

  // 落款
  ctx.fillStyle = "#5f574c";
  ctx.font = "600 22px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("BLEND · CONCEPT FORGE", PAD, H - PAD);
  ctx.fillStyle = "#3f3a33";
  ctx.font = "20px Georgia, serif";
  ctx.fillText(new Date(node.createdAt).toISOString().slice(0, 10), PAD, H - PAD + 34);

  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${tree.title}-${versionLabel}.png`.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
