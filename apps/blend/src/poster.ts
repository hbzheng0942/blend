import type { BlendNode, Element, Tree } from "@blend/core";
import { OPERATORS, STYLE_TAGS } from "@blend/core";
import { blobUrl } from "./blobs";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((res) =>
    canvas.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b!);
      a.download = filename.replace(/[\\/:*?"<>|]/g, "_");
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      res();
    }, "image/png"),
  );
}

/** 单张产物原图下载。 */
export async function downloadOutputImage(hash: string, filename: string): Promise<void> {
  const url = await blobUrl(hash);
  if (!url) throw new Error("图像缺失");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
}

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

  const img = await loadImage(url);

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

  await downloadCanvas(canvas, `${tree.title}-${versionLabel}.png`);
}

/**
 * 谱系整体卡（PRD 3.3，竖版 9:16）：顶部原始要素行 → 中部融合路径
 * （每代 canonical 小图 + 操作符连缀）→ 底部最终产物大图 → 落款。
 */
export async function exportLineagePoster(
  tree: Tree,
  nodes: BlendNode[],
  elements: Element[],
  targetNodeId: string,
): Promise<void> {
  // 上溯血统链（与配方码同序：parents 先于自身）
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: BlendNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (!n) return;
    n.recipe.parentNodeIds.forEach(visit);
    chain.push(n);
  };
  visit(targetNodeId);
  const target = chain[chain.length - 1];
  const targetCanonical = target?.outputs.find((o) => o.id === target.canonicalOutputId);
  if (!targetCanonical) throw new Error("目标节点还没有入谱产物");

  const lineageElementIds = [...new Set(chain.flatMap((n) => n.recipe.elementIds))];
  const els = lineageElementIds
    .map((eid) => elements.find((e) => e.id === eid))
    .filter((e): e is Element => !!e);

  const CW = 1080;
  const CH = 1920;
  const P = 72;
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0f0d0b";
  ctx.fillRect(0, 0, CW, CH);

  // 题头
  ctx.fillStyle = "#93887a";
  ctx.font = "600 26px Georgia, serif";
  ctx.fillText("BLEND · LINEAGE", P, P + 10);
  ctx.fillStyle = "#ede6da";
  ctx.font = "52px Georgia, 'Songti SC', serif";
  ctx.fillText(tree.title, P, P + 74);

  const hairline = (y: number) => {
    ctx.strokeStyle = "rgba(237,230,218,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P, y);
    ctx.lineTo(CW - P, y);
    ctx.stroke();
  };

  // 原始要素行
  let y = P + 120;
  hairline(y - 14);
  ctx.fillStyle = "#5f574c";
  ctx.font = "600 20px Georgia, serif";
  ctx.fillText("ELEMENTS", P, y + 12);
  const eThumb = 96;
  const eGap = 22;
  y += 30;
  for (const [i, el] of els.entries()) {
    const url = await blobUrl(el.imageHash);
    if (!url) continue;
    const x = P + (i % 8) * (eThumb + eGap);
    const ry = y + Math.floor(i / 8) * (eThumb + eGap);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + eThumb / 2, ry + eThumb / 2, eThumb / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(await loadImage(url), x, ry, eThumb, eThumb);
    ctx.restore();
  }
  y += (Math.ceil(els.length / 8) || 1) * (eThumb + eGap) + 26;

  // 融合路径链
  hairline(y - 14);
  ctx.fillStyle = "#5f574c";
  ctx.fillText("PATH", P, y + 12);
  y += 30;
  const cThumb = 148;
  const cGap = 56;
  const perRow = 5;
  for (const [i, n] of chain.entries()) {
    const canonical = n.outputs.find((o) => o.id === n.canonicalOutputId);
    const op = OPERATORS.find((o) => o.id === n.recipe.operator);
    const x = P + (i % perRow) * (cThumb + cGap);
    const ry = y + Math.floor(i / perRow) * (cThumb + cGap);
    if (canonical) {
      const url = await blobUrl(canonical.imageHash);
      if (url) ctx.drawImage(await loadImage(url), x, ry, cThumb, cThumb);
      ctx.strokeStyle = "rgba(237,230,218,0.18)";
      ctx.strokeRect(x - 0.5, ry - 0.5, cThumb + 1, cThumb + 1);
    }
    ctx.fillStyle = "rgba(224,142,69,0.9)";
    ctx.font = "34px Georgia, serif";
    ctx.fillText(op?.symbol ?? "⊕", x + cThumb + 12, ry + cThumb / 2 + 12);
    ctx.fillStyle = "#5f574c";
    ctx.font = "600 18px Georgia, serif";
    ctx.fillText("v" + (i + 1), x, ry + cThumb + 24);
  }
  y += Math.ceil(chain.length / perRow) * (cThumb + cGap) + 26;

  // 最终产物大图（占满剩余空间，正方形）
  const footerH = 110;
  const maxImg = Math.min(CW - P * 2, CH - footerH - y - 20);
  const imgX = (CW - maxImg) / 2;
  const finalUrl = await blobUrl(targetCanonical.imageHash);
  if (finalUrl) ctx.drawImage(await loadImage(finalUrl), imgX, y, maxImg, maxImg);
  ctx.strokeStyle = "rgba(237,230,218,0.18)";
  ctx.strokeRect(imgX - 0.5, y - 0.5, maxImg + 1, maxImg + 1);
  if (targetCanonical.conceptName) {
    ctx.fillStyle = "#ede6da";
    ctx.font = "italic 30px Georgia, serif";
    ctx.fillText(targetCanonical.conceptName, imgX, y + maxImg + 40);
  }

  // 落款
  ctx.fillStyle = "#5f574c";
  ctx.font = "600 22px Georgia, serif";
  ctx.fillText("BLEND · CONCEPT FORGE", P, CH - P + 10);
  ctx.fillStyle = "#3f3a33";
  ctx.font = "20px Georgia, serif";
  ctx.fillText(
    `${chain.length} forgings · ${els.length} elements · ${new Date().toISOString().slice(0, 10)}`,
    P, CH - P + 42,
  );

  await downloadCanvas(canvas, `${tree.title}-lineage.png`);
}
