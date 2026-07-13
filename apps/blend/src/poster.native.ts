import type { BlendNode, Tree } from "@blend/core";

/** 卡面导出 native 端（Phase 3 待实现：react-native-view-shot + expo-sharing）。 */
export async function exportPoster(_tree: Tree, _node: BlendNode, _versionLabel: string): Promise<void> {
  throw new Error("iOS 端卡面导出即将推出，当前请在 web 端操作");
}
