/** 风格维度（与操作符正交），PRD 1.4。多选，最多 3 个。 */

export interface StyleTag {
  id: string;
  axis: "material" | "era" | "render";
  nameZh: string;
  fragment: string;
}

export const MAX_STYLE_TAGS = 3;

export const STYLE_TAGS: StyleTag[] = [
  // 材质轴
  { id: "ceramic", axis: "material", nameZh: "陶瓷", fragment: "rendered as glossy glazed ceramic" },
  { id: "biological", axis: "material", nameZh: "生物", fragment: "made of organic biological tissue, veins and chitin" },
  { id: "mechanical", axis: "material", nameZh: "机械", fragment: "constructed from intricate mechanical parts, gears and panels" },
  { id: "liquid-metal", axis: "material", nameZh: "液态金属", fragment: "formed from flowing liquid chrome metal" },
  { id: "paper-craft", axis: "material", nameZh: "纸艺", fragment: "crafted from folded paper and cardboard, papercraft style" },
  { id: "voxel", axis: "material", nameZh: "体素", fragment: "built from 3D voxel cubes" },
  // 时代轴
  { id: "ancient-bronze", axis: "era", nameZh: "青铜时代", fragment: "as an ancient bronze relic with patina" },
  { id: "y2k", axis: "era", nameZh: "千禧", fragment: "in Y2K aesthetic, translucent plastic and chrome" },
  { id: "cyberpunk", axis: "era", nameZh: "赛博朋克", fragment: "cyberpunk style with neon glow and dark tech" },
  { id: "solar-punk", axis: "era", nameZh: "太阳朋克", fragment: "solarpunk style, lush greenery fused with clean technology" },
  // 渲染轴
  { id: "photoreal", axis: "render", nameZh: "写实摄影", fragment: "photorealistic studio photography" },
  { id: "anime-cel", axis: "render", nameZh: "赛璐璐动画", fragment: "anime cel-shaded illustration style" },
  { id: "blueprint", axis: "render", nameZh: "蓝图", fragment: "as a technical blueprint drawing with annotations" },
  { id: "clay-render", axis: "render", nameZh: "黏土渲染", fragment: "soft clay 3D render, matte plasticine look" },
];

const byId = new Map(STYLE_TAGS.map((t) => [t.id, t]));

export function styleFragments(tagIds: string[]): string[] {
  return tagIds.slice(0, MAX_STYLE_TAGS).flatMap((id) => {
    const t = byId.get(id);
    return t ? [t.fragment] : [];
  });
}
