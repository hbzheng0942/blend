import type { Tree } from "@blend/core";

/**
 * `.blend` 导出/导入的 native 端（Phase 3 待实现：expo-sharing + DocumentPicker）。
 * 当前先提示走 web 端，保持与 blendfile.ts 相同的导出面。
 */

export async function exportTreeToBlendFile(_treeId: string): Promise<void> {
  throw new Error("iOS 端 .blend 导出即将推出，当前请在 web 端操作");
}

export async function importBlendFile(_file: File): Promise<Tree> {
  throw new Error("iOS 端 .blend 导入即将推出，当前请在 web 端操作");
}

export async function pickBlendFile(): Promise<File | null> {
  return null;
}
