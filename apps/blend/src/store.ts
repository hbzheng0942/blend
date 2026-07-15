import { create } from "zustand";
import Constants from "expo-constants";
import type {
  BlendMode, BlendNode, DirectorConcept, Element, OperatorId, Output, Recipe, Tree,
} from "@blend/core";
import {
  DIRECTOR_ONLY_OPERATORS, OPERATORS, STYLE_TAGS, buildPrompt, forgeInputHashes,
  recastInputHashes, resolveDirectorConceptBatch, runCascade, styleFragments, uuid,
} from "@blend/core";
import type { AgnesModelId } from "@blend/providers";
import {
  FurnaceOverheatError, GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_BASE_URL,
  OPENAI_DEFAULT_IMAGE_MODEL, createAgnesDirector, createAgnesProvider,
  createGeminiProvider, createOpenAICompatibleProvider, type DirectorIssue,
} from "@blend/providers";
import { blobDataUriScaled, storeBlob, storeDataUri } from "./blobs";
import { getStorage } from "./storage";

/** 设置（key 只存本地，PRD 2.4 DECISION LOCKED）。 */
const KEY_STORAGE = "blend.agnes.apiKey";
const MODEL_STORAGE = "blend.agnes.model";
const PROVIDER_STORAGE = "blend.provider";
const GEMINI_KEY_STORAGE = "blend.gemini.apiKey";
const OPENAI_KEY_STORAGE = "blend.openai.apiKey";
const OPENAI_BASE_URL_STORAGE = "blend.openai.baseUrl";
const OPENAI_MODEL_STORAGE = "blend.openai.model";

export type ProviderChoice = "agnes" | "gemini" | "openai";

export const loadApiKey = () => globalThis.localStorage?.getItem(KEY_STORAGE) ?? "";

/**
 * 内置免费通道：构建时注入自部署的 Cloudflare Worker 反代地址
 * （Worker 端持有 Agnes key，见 docs/agnes-proxy-setup.md）。
 * 用户自填 key 时直连 Agnes 官方，优先级高于内置通道。
 */
export const BUILTIN_PROXY_URL =
  process.env.EXPO_PUBLIC_AGNES_PROXY_URL ??
  String(Constants.expoConfig?.extra?.agnesProxyUrl ?? "");
export const hasBuiltinChannel = () => BUILTIN_PROXY_URL.length > 0;
export const loadModelId = (): AgnesModelId =>
  (globalThis.localStorage?.getItem(MODEL_STORAGE) as AgnesModelId) ?? "agnes-image-2.1-flash";
export const loadProviderChoice = (): ProviderChoice =>
  (globalThis.localStorage?.getItem(PROVIDER_STORAGE) as ProviderChoice) ?? "agnes";
export const loadGeminiKey = () => globalThis.localStorage?.getItem(GEMINI_KEY_STORAGE) ?? "";
export const loadOpenAIKey = () => globalThis.localStorage?.getItem(OPENAI_KEY_STORAGE) ?? "";
export const loadOpenAIBaseUrl = () => globalThis.localStorage?.getItem(OPENAI_BASE_URL_STORAGE) ?? OPENAI_DEFAULT_BASE_URL;
export const loadOpenAIModel = () => globalThis.localStorage?.getItem(OPENAI_MODEL_STORAGE) ?? OPENAI_DEFAULT_IMAGE_MODEL;

export type ForgeStatus =
  | { phase: "idle" }
  | {
      phase: "forging";
      /** 已出炉候选数（并行生成，先出先展示） */
      done: number;
      total: number;
      /** director 方案名（拿到后即展示，等待期有盼头） */
      conceptNames?: string[];
      directorMode?: "vlm" | "fallback";
      directorIssue?: DirectorIssue;
    }
  | { phase: "overheat"; cooldownSeconds: number }
  | { phase: "error"; message: string };

/** 当前锻造的中止句柄（一次只有一炉在烧）。 */
let forgeController: AbortController | null = null;

function localFallbackConcept(recipe: Recipe, staticPrompt: string): DirectorConcept {
  const styleName = recipe.styleTags
    .map((id) => STYLE_TAGS.find((tag) => tag.id === id)?.nameZh)
    .find(Boolean);
  const operatorName = OPERATORS.find((item) => item.id === recipe.operator)?.nameZh ?? "异变";
  const name = styleName
    ? `${styleName}${operatorName}体`.slice(0, 6)
    : recipe.operator === "auto" ? "保守融合体" : `保守${operatorName}体`.slice(0, 6);
  return {
    name,
    equation: `输入形态 × ${styleName ? `${styleName}质感` : "未知变量"} → ${name}`,
    prompt:
      staticPrompt +
      " Commit to one iconic silhouette and one decisive fusion idea. Create a single coherent " +
      "subject, never a side-by-side composition or loose collage.",
  };
}

function directorIssueMessage(issue?: DirectorIssue) {
  switch (issue) {
    case "timeout": return "导演响应超时";
    case "rate-limit": return "公共导演正在排队";
    case "upstream": return "导演上游暂不可用";
    case "invalid-response": return "导演方案未通过格式校验";
    default: return "导演连接中断";
  }
}

interface BlendState {
  apiKey: string;
  modelId: AgnesModelId;
  providerChoice: ProviderChoice;
  geminiKey: string;
  openaiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  setApiKey(k: string): void;
  setModelId(m: AgnesModelId): void;
  setProviderChoice(p: ProviderChoice): void;
  setGeminiKey(k: string): void;
  setOpenAIKey(k: string): void;
  setOpenAIBaseUrl(url: string): void;
  setOpenAIModel(model: string): void;

  trees: Tree[];
  refreshTrees(): Promise<void>;
  createTree(title: string): Promise<Tree>;
  deleteTree(id: string): Promise<void>;

  // 当前打开的树
  tree: Tree | null;
  nodes: BlendNode[];
  elements: Element[];
  loadTree(id: string): Promise<void>;

  addElementFromBlob(blob: Blob): Promise<Element>;
  forge(req: {
    /** 0=根锻造，1=迭代/fork，2+=merge */
    parentNodeIds: string[];
    elementIds: string[];
    operator: OperatorId;
    styleTags?: string[];
    userPromptExtra?: string;
    /** 守序 0 ⇄ 1 混沌 */
    chaos?: number;
    mode?: BlendMode;
    /** 追加候选到已有节点（重 roll） */
    intoNodeId?: string;
    candidates?: number;
  }): Promise<BlendNode | null>;
  canonize(nodeId: string, outputId: string): Promise<void>;
  /** 中止当前锻造（已出炉的候选保留） */
  cancelForge(): void;
  /** 画布拖拽后持久化节点位置 */
  moveNode(nodeId: string, pos: { x: number; y: number }): Promise<void>;

  status: ForgeStatus;
}

export const useBlend = create<BlendState>((set, get) => ({
  apiKey: loadApiKey(),
  modelId: loadModelId(),
  setApiKey(k) {
    globalThis.localStorage?.setItem(KEY_STORAGE, k);
    set({ apiKey: k });
  },
  setModelId(m) {
    globalThis.localStorage?.setItem(MODEL_STORAGE, m);
    set({ modelId: m });
  },
  providerChoice: loadProviderChoice(),
  geminiKey: loadGeminiKey(),
  openaiKey: loadOpenAIKey(),
  openaiBaseUrl: loadOpenAIBaseUrl(),
  openaiModel: loadOpenAIModel(),
  setProviderChoice(p) {
    globalThis.localStorage?.setItem(PROVIDER_STORAGE, p);
    set({ providerChoice: p });
  },
  setGeminiKey(k) {
    globalThis.localStorage?.setItem(GEMINI_KEY_STORAGE, k);
    set({ geminiKey: k });
  },
  setOpenAIKey(k) {
    globalThis.localStorage?.setItem(OPENAI_KEY_STORAGE, k);
    set({ openaiKey: k });
  },
  setOpenAIBaseUrl(url) {
    globalThis.localStorage?.setItem(OPENAI_BASE_URL_STORAGE, url);
    set({ openaiBaseUrl: url });
  },
  setOpenAIModel(model) {
    globalThis.localStorage?.setItem(OPENAI_MODEL_STORAGE, model);
    set({ openaiModel: model });
  },

  trees: [],
  async refreshTrees() {
    set({ trees: await getStorage().listTrees() });
  },
  async createTree(title) {
    const now = Date.now();
    const tree: Tree = {
      id: uuid(), title, rootElementIds: [], nodeIds: [],
      canvasLayout: {}, createdAt: now, updatedAt: now,
    };
    await getStorage().putTree(tree);
    await get().refreshTrees();
    return tree;
  },
  async deleteTree(id) {
    await getStorage().deleteTree(id);
    await get().refreshTrees();
  },

  tree: null,
  nodes: [],
  elements: [],
  async loadTree(id) {
    const s = getStorage();
    const [tree, nodes, elements] = await Promise.all([
      s.getTree(id), s.getNodes(id), s.getElements(id),
    ]);
    nodes.sort((a, b) => a.createdAt - b.createdAt);
    set({ tree, nodes, elements });
  },

  async addElementFromBlob(blob) {
    const { tree } = get();
    if (!tree) throw new Error("no tree loaded");
    const hash = await storeBlob(blob);
    const el: Element = {
      id: uuid(), imageHash: hash, source: "upload", createdAt: Date.now(),
      meta: { mime: blob.type },
    };
    await getStorage().putElement(tree.id, el);
    const next = { ...tree, rootElementIds: [...tree.rootElementIds, el.id], updatedAt: Date.now() };
    await getStorage().putTree(next);
    set({ elements: [...get().elements, el], tree: next });
    return el;
  },

  async forge({
    parentNodeIds, elementIds, operator, styleTags = [], userPromptExtra, chaos,
    mode = "forge", intoNodeId, candidates = 2,
  }) {
    const {
      tree, nodes, elements, apiKey, modelId, providerChoice, geminiKey,
      openaiKey, openaiBaseUrl, openaiModel,
    } = get();
    if (!tree) throw new Error("no tree loaded");
    if (providerChoice === "gemini" && !geminiKey) {
      set({ status: { phase: "error", message: "Gemini 需要自备 key（aistudio.google.com），去设置页贴入" } });
      return null;
    }
    if (providerChoice === "agnes" && !apiKey && !hasBuiltinChannel()) {
      set({ status: { phase: "error", message: "先去设置页贴入 Agnes API key（免费注册，key 只存你本地）" } });
      return null;
    }
    if (providerChoice === "openai" && (!openaiKey.trim() || !openaiBaseUrl.trim() || !openaiModel.trim())) {
      set({ status: { phase: "error", message: "OpenAI-compatible 通道需要 API key、Base URL 和图片模型名" } });
      return null;
    }

    const recipe: Recipe = { parentNodeIds, elementIds, operator, styleTags, userPromptExtra, chaos, mode };

    const nodeReader = { getNode: (nid: string) => nodes.find((n) => n.id === nid) };
    const elementHash = (eid: string) => {
      const el = elements.find((e) => e.id === eid);
      if (!el) throw new Error("element not found: " + eid);
      return el.imageHash;
    };
    let inputHashes: string[];
    try {
      inputHashes = mode === "recast"
        ? recastInputHashes(recipe, nodeReader, elementHash)
        : forgeInputHashes(recipe, nodeReader, elementHash);
    } catch (e) {
      set({ status: { phase: "error", message: (e as Error).message } });
      return null;
    }
    if (inputHashes.length === 0) {
      set({ status: { phase: "error", message: "至少投入 1 张图" } });
      return null;
    }

    // agnes 通道：用户自填 key → 直连官方；否则内置 Worker（key 在 Worker 端）。
    // director 始终走 agnes 通道（gemini 生图时也是）；两者都没有则跳过 director。
    const agnesChannel = apiKey
      ? { apiKey }
      : hasBuiltinChannel()
        ? { apiKey: "builtin", baseUrl: BUILTIN_PROXY_URL }
        : null;
    const usingBuiltinAgnes = !apiKey && !!agnesChannel;
    const provider = providerChoice === "gemini"
      ? createGeminiProvider({ apiKey: geminiKey })
      : providerChoice === "openai"
        ? createOpenAICompatibleProvider({ apiKey: openaiKey, baseUrl: openaiBaseUrl, modelId: openaiModel })
        : createAgnesProvider({
            ...agnesChannel!, modelId,
            ...(usingBuiltinAgnes ? {
              timeoutMs: 120_000,
              retryDelaysMs: [5_000],
              fallbackModelId: modelId === "agnes-image-2.1-flash" ? "agnes-image-2.0-flash" : "agnes-image-2.1-flash",
            } : {}),
          });
    if (!provider.capabilities.supportedOperators.includes(operator)) {
      set({ status: { phase: "error", message: "该模型尚未掌握此禁术（spike 判定不达标）" } });
      return null;
    }

    const effectiveModelId = providerChoice === "gemini"
      ? GEMINI_DEFAULT_MODEL
      : providerChoice === "openai"
        ? openaiModel
        : modelId;
    const staticPrompt = buildPrompt(recipe);
    const outputs: Output[] = [];

    // VLM director：一次调用产出 candidates 条互异设计方案（每候选一条）。
    // 失败/超时静默回退静态骨架，不增加锻造失败面。
    forgeController?.abort();
    forgeController = new AbortController();
    const signal = forgeController.signal;
    set({ status: { phase: "forging", done: 0, total: candidates } });
    let directedConcepts: DirectorConcept[] | null = null;
    let directorIssue: DirectorIssue | undefined;
    if (agnesChannel) {
      const director = createAgnesDirector(agnesChannel);
      // director 只需看懂内容，384px 进一步压 payload（大图是 chat 端点断连主因）
      const directorImages = await Promise.all(
        inputHashes
          .slice(0, provider.capabilities.maxInputImages)
          .map((h) => blobDataUriScaled(h, 384)),
      );
      const outcome = await director
        .directDetailed({
          operator, images: directorImages, count: candidates,
          styleFragments: styleFragments(styleTags), userPromptExtra, chaos, signal,
        })
        .catch(() => ({ concepts: null, issue: "network" as const }));
      directedConcepts = outcome.concepts;
      directorIssue = outcome.issue;
    }
    if (signal.aborted) {
      set({ status: { phase: "idle" } });
      return null;
    }
    // subtract/intersect 只有 director 出的 prompt 才语义达标（spike 翻案结论），
    // 回退静态骨架必然出废图 → 直接中止
    if (!directedConcepts && DIRECTOR_ONLY_OPERATORS.has(operator)) {
      set({ status: { phase: "error", message: `此禁术需要导演出手，但${directorIssueMessage(directorIssue)}——稍后再试` } });
      return null;
    }
    // 不伪造候选数：导演只给几套就生成几套；导演失败则明确降级为一个本地方案。
    const conceptBatch = resolveDirectorConceptBatch(
      directedConcepts,
      candidates,
      localFallbackConcept(recipe, staticPrompt),
    );
    const concepts = conceptBatch.concepts;
    const actualCandidates = concepts.length;
    const directorMode = conceptBatch.source;
    const conceptNames = concepts.map((concept) => concept.name);
    set({ status: { phase: "forging", done: 0, total: actualCandidates, conceptNames, directorMode, directorIssue } });

    const seedBase = Date.now() % 2_000_000_000;
    const makeRunner = (candidateIndex: number) => {
      let stepIndex = 0;
      return {
        providerId: provider.id,
        modelId: effectiveModelId,
        maxInputImages: provider.capabilities.maxInputImages,
        async runStep(hashes: string[], stepPrompt: string) {
          const images = await Promise.all(hashes.map((h) => blobDataUriScaled(h, 1536)));
          const seed = seedBase + candidateIndex * 104_729 + stepIndex++ * 8_191;
          const res = await provider.generate({ prompt: stepPrompt, images, signal, seed });
          return storeDataUri(res.image);
        },
      };
    };

    // 并行抽卡 + 先出先展示：每张候选完成即落库刷新，不等整炉。
    const s = getStorage();
    let node: BlendNode | null = intoNodeId
      ? (nodes.find((n) => n.id === intoNodeId) ?? null)
      : null;
    if (intoNodeId && !node) throw new Error("reroll target node not found");
    let persistQueue: Promise<void> = Promise.resolve();
    const persistOutput = (o: Output) => {
      persistQueue = persistQueue.then(async () => {
        outputs.push(o);
        if (!node) {
          node = {
            id: uuid(), recipe, outputs: [o],
            canonicalOutputId: o.id, createdAt: Date.now(),
          };
          await s.putNode(tree.id, node);
          const cur = get().tree!;
          const next = { ...cur, nodeIds: [...cur.nodeIds, node.id], updatedAt: Date.now() };
          await s.putTree(next);
          set({ tree: next });
        } else {
          node = { ...node, outputs: [...node.outputs, o] };
          await s.putNode(tree.id, node);
        }
        const rest = get().nodes.filter((n) => n.id !== node!.id);
        set({
          nodes: [...rest, node].sort((a, b) => a.createdAt - b.createdAt),
          status: { phase: "forging", done: outputs.length, total: actualCandidates, conceptNames, directorMode, directorIssue },
        });
      });
      return persistQueue;
    };

    const results = await Promise.allSettled(
      Array.from({ length: actualCandidates }, async (_v, i) => {
        const concept = concepts[i]!;
        const prompt = concept.prompt;
        const seed = seedBase + i * 104_729;
        const { outputHash, executionPlan } = await runCascade(inputHashes, prompt, makeRunner(i));
        await persistOutput({
          id: uuid(), imageHash: outputHash,
          executionPlan, providerId: provider.id, modelId: effectiveModelId, finalPrompt: prompt,
          seed, conceptName: concept.name, conceptEquation: concept.equation, conceptSource: directorMode,
        });
      }),
    );
    await persistQueue;

    if (outputs.length === 0) {
      // 一张都没炼出来才算失败；炼出部分则带着已有成果落库
      if (signal.aborted) {
        set({ status: { phase: "idle" } });
        return null;
      }
      const firstErr = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      )?.reason as Error | undefined;
      if (firstErr instanceof FurnaceOverheatError) {
        set({ status: { phase: "overheat", cooldownSeconds: firstErr.cooldownSeconds } });
      } else {
        set({ status: { phase: "error", message: firstErr?.message ?? "锻造失败" } });
      }
      return null;
    }
    set({ status: { phase: "idle" } });
    return node;
  },

  cancelForge() {
    forgeController?.abort();
  },

  async canonize(nodeId, outputId) {
    const { tree, nodes } = get();
    if (!tree) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const next = { ...node, canonicalOutputId: outputId };
    await getStorage().putNode(tree.id, next);
    set({ nodes: nodes.map((n) => (n.id === nodeId ? next : n)) });
  },

  async moveNode(nodeId, pos) {
    const { tree } = get();
    if (!tree) return;
    const next = {
      ...tree,
      canvasLayout: { ...tree.canvasLayout, [nodeId]: pos },
      updatedAt: Date.now(),
    };
    await getStorage().putTree(next);
    set({ tree: next });
  },

  status: { phase: "idle" },
}));

// dev-only：暴露 store 便于控制台调试/E2E 驱动
declare const __DEV__: boolean | undefined;
if (typeof __DEV__ !== "undefined" && __DEV__ && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__blend = useBlend;
}
