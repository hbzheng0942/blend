import type { Recipe } from "./types";
import { OPERATOR_PROMPTS, type OperatorPromptOverrides } from "./prompts/operators";
import { styleFragments } from "./prompts/styles";

/**
 * 把 Recipe 的意图组装成实际发送的 prompt。
 * 结构：操作符骨架 + 风格片段 + 用户自由补充。
 */
export function buildPrompt(recipe: Recipe, overrides?: OperatorPromptOverrides): string {
  const parts = [overrides?.[recipe.operator] ?? OPERATOR_PROMPTS[recipe.operator]];
  const styles = styleFragments(recipe.styleTags);
  if (styles.length) parts.push("Style: " + styles.join("; ") + ".");
  const extra = recipe.userPromptExtra?.trim();
  if (extra) parts.push(extra);
  return parts.join(" ");
}
