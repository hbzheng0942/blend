import { sha256Hex } from "@blend/core";
import { getStorage } from "./storage";

/** blob ↔ hash ↔ objectURL/dataURI 的胶水层（内容寻址，全局去重）。 */

const urlCache = new Map<string, string>();

/** 存入 blob，返回 sha256 hash（已存在则直接复用）。 */
export async function storeBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await sha256Hex(buf);
  const s = getStorage();
  if (!(await s.hasBlob(hash))) await s.putBlob(hash, blob);
  return hash;
}

/** hash → 可渲染的 object URL（带缓存）。 */
export async function blobUrl(hash: string): Promise<string | null> {
  const hit = urlCache.get(hash);
  if (hit) return hit;
  const blob = await getStorage().getBlob(hash);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(hash, url);
  return url;
}

/** hash → data URI（发给 provider 用）。 */
export async function blobDataUri(hash: string): Promise<string> {
  const blob = await getStorage().getBlob(hash);
  if (!blob) throw new Error("blob not found: " + hash);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * hash → 缩放后的 JPEG data URI。
 * Agnes chat/生图端点对大 payload 极不稳定（实测多 MB 请求体随机断连），
 * director 只需看懂内容（512px 足够），生图输入 1536px 保细节。
 */
export async function blobDataUriScaled(hash: string, maxDim: number): Promise<string> {
  const blob = await getStorage().getBlob(hash);
  if (!blob) throw new Error("blob not found: " + hash);
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.size < 400_000) {
    bmp.close();
    return blobDataUri(hash);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

/** data URI（provider 返回值）→ 存为 blob，返回 hash。 */
export async function storeDataUri(dataUri: string): Promise<string> {
  const resp = await fetch(dataUri);
  return storeBlob(await resp.blob());
}

/** web 端文件选择（Phase 1；iOS 端 Phase 3 换 expo-image-picker）。 */
export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => resolve([...(input.files ?? [])]);
    // 用户取消时部分浏览器不触发任何事件，focus 兜底
    window.addEventListener("focus", () => setTimeout(() => resolve([]), 300), { once: true });
    input.click();
  });
}
