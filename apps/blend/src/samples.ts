import type { RecipePlan } from "@blend/core";
import { RECIPE_CODE_VERSION } from "@blend/core";

/**
 * 首页案例配方：内置 plan（不含图片），一键导入进重演绎流程，
 * 新用户用自己的图立即上手。prompt 取自 spike 实测的优胜结果。
 */

export interface SampleRecipe {
  title: string;
  desc: string;
  plan: RecipePlan;
}

export const SAMPLE_RECIPES: SampleRecipe[] = [
  {
    title: "深渊茶会",
    desc: "两图融合成新物种，再注入一层氛围 —— ⊕ 融合 → → 注入",
    plan: {
      v: RECIPE_CODE_VERSION,
      t: "深渊茶会",
      e: [
        { h: "sample-a", label: "一件器物（如茶壶）" },
        { h: "sample-b", label: "一只生物（如章鱼）" },
        { h: "sample-c", label: "一张氛围图（如星云）" },
      ],
      s: [
        { p: [], e: [0, 1], o: "fuse", s: [], m: "forge", n: "Ceramic Cephalopod" },
        { p: [0], e: [2], o: "inject", s: [], m: "forge" },
      ],
    },
  },
  {
    title: "万物公约数",
    desc: "三张风马牛不相及的图，蒸馏出它们唯一的共同气质 —— ∩ 交集",
    plan: {
      v: RECIPE_CODE_VERSION,
      t: "万物公约数",
      e: [
        { h: "sample-d", label: "随便一张图" },
        { h: "sample-e", label: "再来一张" },
        { h: "sample-f", label: "第三张，越不相干越好" },
      ],
      s: [{ p: [], e: [0, 1, 2], o: "intersect", s: [], m: "forge", n: "Nebula Origami" }],
    },
  },
];
