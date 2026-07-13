import type { BlendMode, BlendNode, Element, OperatorId, Tree } from "./types";

/**
 * 配方码（PRD 3.3 病毒单元）：把"炼到某个节点"的 recipe 链序列化为可分享的短码。
 * 只含结构 + prompt + 操作符（不含图片本体）；他人导入后用自己的图重演绎，
 * 形成"同一配方不同结果"的对比传播。
 * 本模块只负责 plan 的构建/校验（纯数据）；deflate+base64url 由 app 层完成。
 * 字段名刻意压缩（要进二维码）。
 */

export const RECIPE_CODE_VERSION = 1;
export const RECIPE_CODE_PREFIX = "BLEND1.";

export interface RecipePlanStep {
  /** parent 在 steps 中的下标 */
  p: number[];
  /** 本步新增要素在 e 表中的下标 */
  e: number[];
  o: OperatorId;
  /** styleTags */
  s: string[];
  /** userPromptExtra */
  x?: string;
  m: BlendMode;
  /** canonical 产物实际使用的 finalPrompt（精确复刻用；重新导演可忽略） */
  fp?: string;
  /** director 方案名 */
  n?: string;
}

export interface RecipePlan {
  v: number;
  /** 树名 */
  t: string;
  /** 要素表：hash 前缀（身份标识，便于跨步骤复用同一张图），可带标注 */
  e: Array<{ h: string; label?: string }>;
  s: RecipePlanStep[];
}

/** 从目标节点上溯整条 recipe 链，构建可序列化 plan。 */
export function buildRecipePlan(
  tree: Tree,
  nodes: BlendNode[],
  elements: Element[],
  targetNodeId: string,
): RecipePlan {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order: BlendNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (!n) throw new Error(`node not found: ${id}`);
    n.recipe.parentNodeIds.forEach(visit);
    order.push(n);
  };
  visit(targetNodeId);

  const stepIndex = new Map(order.map((n, i) => [n.id, i]));
  const elementIndex = new Map<string, number>();
  const planElements: RecipePlan["e"] = [];
  const elementEntry = (eid: string): number => {
    const cached = elementIndex.get(eid);
    if (cached !== undefined) return cached;
    const el = elements.find((e) => e.id === eid);
    if (!el) throw new Error(`element not found: ${eid}`);
    const idx = planElements.length;
    planElements.push({ h: el.imageHash.slice(0, 12), ...(el.meta?.label ? { label: el.meta.label } : {}) });
    elementIndex.set(eid, idx);
    return idx;
  };

  const steps: RecipePlanStep[] = order.map((n) => {
    const canonical = n.outputs.find((o) => o.id === n.canonicalOutputId);
    return {
      p: n.recipe.parentNodeIds.map((pid) => stepIndex.get(pid)!),
      e: n.recipe.elementIds.map(elementEntry),
      o: n.recipe.operator,
      s: n.recipe.styleTags,
      ...(n.recipe.userPromptExtra ? { x: n.recipe.userPromptExtra } : {}),
      m: n.recipe.mode,
      ...(canonical ? { fp: canonical.finalPrompt } : {}),
      ...(canonical?.conceptName ? { n: canonical.conceptName } : {}),
    };
  });

  return { v: RECIPE_CODE_VERSION, t: tree.title, e: planElements, s: steps };
}

/** 结构校验；返回错误消息，null = 通过。 */
export function validateRecipePlan(raw: unknown): string | null {
  const p = raw as Partial<RecipePlan> | null;
  if (!p || typeof p !== "object") return "配方码不是对象";
  if (p.v !== RECIPE_CODE_VERSION) return `不支持的配方码版本：${String(p.v)}`;
  if (typeof p.t !== "string") return "缺少树名";
  if (!Array.isArray(p.e) || !Array.isArray(p.s) || p.s.length === 0) return "要素/步骤缺失";
  for (const [i, st] of p.s.entries()) {
    if (!Array.isArray(st.p) || !Array.isArray(st.e) || !Array.isArray(st.s)) {
      return `步骤 ${i} 结构损坏`;
    }
    if (st.p.some((x) => typeof x !== "number" || x < 0 || x >= i)) {
      return `步骤 ${i} 的 parent 引用越界（必须指向更早步骤）`;
    }
    if (st.e.some((x) => typeof x !== "number" || x < 0 || x >= p.e!.length)) {
      return `步骤 ${i} 的要素引用越界`;
    }
    if (typeof st.o !== "string" || typeof st.m !== "string") return `步骤 ${i} 缺操作符/模式`;
    if (st.p.length === 0 && st.e.length === 0) return `步骤 ${i} 没有任何输入`;
  }
  return null;
}
