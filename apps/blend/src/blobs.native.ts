import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { blobFileUri, getStorage } from "./storage.native";

/**
 * blobs 胶水层的 iOS/Android 实现（web 版见 blobs.ts）。
 * 差异点：hash 用 expo-crypto（Hermes 无 crypto.subtle）；渲染用 file:// URI。
 */

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalThis.btoa(bin);
}

async function storeBytes(bytes: Uint8Array): Promise<string> {
  const hash = await hashBytes(bytes);
  const s = getStorage();
  if (!(await s.hasBlob(hash))) await s.putBlob(hash, bytes);
  return hash;
}

export async function storeBlob(blob: Blob): Promise<string> {
  return storeBytes(new Uint8Array(await blob.arrayBuffer()));
}

/** hash → 渲染 URI：native 直接给 file:// 路径，零拷贝。 */
export async function blobUrl(hash: string): Promise<string | null> {
  return blobFileUri(hash);
}

/** hash → data URI（发给 provider）。 */
export async function blobDataUri(hash: string): Promise<string> {
  const blob = await getStorage().getBlob(hash);
  if (!blob) throw new Error("blob not found: " + hash);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return "data:image/png;base64," + bytesToBase64(bytes);
}

/** data URI（provider 返回值）→ 落盘，返回 hash。 */
export async function storeDataUri(dataUri: string): Promise<string> {
  const b64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return storeBytes(base64ToBytes(b64));
}

/** 相册选图 → 逐张落盘，返回 Blob 形状与 web 版对齐（store.addElementFromBlob 复用）。 */
export async function pickImageFiles(): Promise<Blob[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsMultipleSelection: true,
    base64: true,
    quality: 0.92,
  });
  if (res.canceled) return [];
  return res.assets
    .filter((a) => a.base64)
    .map((a) => new Blob([base64ToBytes(a.base64!) as Uint8Array<ArrayBuffer>], { type: "image/png" }));
}

/** native 端暂不缩放（无 canvas；后续可换 expo-image-manipulator）。 */
export async function blobDataUriScaled(hash: string, _maxDim: number): Promise<string> {
  return blobDataUri(hash);
}
