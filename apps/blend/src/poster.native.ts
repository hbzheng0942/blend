import type { BlendNode, Element, Tree } from "@blend/core";

/** 卡面/谱系卡导出 native 端（Phase 3 待实现：react-native-view-shot + expo-sharing）。 */
export async function exportPoster(_tree: Tree, _node: BlendNode, _versionLabel: string): Promise<void> {
  throw new Error("iOS 端卡面导出即将推出，当前请在 web 端操作");
}

export async function exportLineagePoster(
  _tree: Tree, _nodes: BlendNode[], _elements: Element[], _targetNodeId: string,
): Promise<void> {
  throw new Error("iOS 端谱系卡导出即将推出，当前请在 web 端操作");
}

export async function downloadOutputImage(_hash: string, _filename: string): Promise<void> {
  throw new Error("iOS 端原图导出即将推出，当前请在 web 端操作");
}
