import { create } from "zustand";
import type {
  BlendMode, BlendNode, DirectorConcept, Element, OperatorId, Output, Recipe, Tree,
} from "@blend/core";
import {
  DIRECTOR_ONLY_OPERATORS, buildPrompt, forgeInputHashes, recastInputHashes, runCascade,
  styleFragments, uuid,
} from "@blend/core";
import type { AgnesModelId } from "@blend/providers";
import {
  FurnaceOverheatError, GEMINI_DEFAULT_MODEL, createAgnesDirector, createAgnesProvider,
  createGeminiProvider,
} from "@blend/providers";
import { blobDataUriScaled, storeBlob, storeDataUri } from "./blobs";
import { getStorage } from "./storage";

/** 设置（key 只存本地，PRD 2.4 DECISION LOCKED）。 */
const KEY_STORAGE = "blend.agnes.apiKey";
const MODEL_STORAGE = "blend.agnes.model";
const PROVIDER_STORAGE = "blend.provider";
const GEMINI_KEY_STORAGE = "blend.gemini.apiKey";

export type ProviderChoice = "agnes" | "gemini";

export const loadApiKey = () => globalThis.localStorage?.getItem(KEY_STORAGE) ?? "";

/**
 * 内置免费通道：构建时注入自部署的 Cloudflare Worker 反代地址
 * （Worker 端持有 Agnes key，见 docs/agnes-proxy-setup.md）。
 * 用户自填 key 时直连 Agnes 官方，优先级高于内置通道。
 */
export const BUILTIN_PROXY_URL = process.env.EXPO_PUBLIC_AGNES_PROXY_URL ?? "";
export const hasBuiltinChannel = () => BUILTIN_PROXY_URL.length > 0;
export const loadModelId = (): AgnesModelId =>
  (globalThis.localStorage?.getItem(MODEL_STORAGE) as AgnesModelId) ?? "agnes-image-2.1-flash";
export const loadProviderChoice = (): ProviderChoice =>
  (globalThis.localStorage?.getItem(PROVIDER_STORAGE) as ProviderChoice) ?? "agnes";
export const loadGeminiKey = () => globalThis.localStorage?.getItem(GEMINI_KEY_STORAGE) ?? "";

export type ForgeStatus =
  | { phase: "idle" }
  | { phase: "forging"; candidate: number; total: number }
  | { phase: "overheat"; cooldownSeconds: number }
  | { phase: "error"; message: string };

interface BlendState {
  apiKey: string;
  modelId: AgnesModelId;
  providerChoice: ProviderChoice;
  geminiKey: string;
  setApiKey(k: string): void;
  setModelId(m: AgnesModelId): void;
  setProviderChoice(p: ProviderChoice): void;
  setGeminiKey(k: string): void;

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
    mode?: BlendMode;
    /** 追加候选到已有节点（重 roll） */
    intoNodeId?: string;
    candidates?: number;
  }): Promise<BlendNode | null>;
  canonize(nodeId: string, outputId: string): Promise<void>;
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
  setProviderChoice(p) {
    globalThis.localStorage?.setItem(PROVIDER_STORAGE, p);
    set({ providerChoice: p });
  },
  setGeminiKey(k) {
    globalThis.localStorage?.setItem(GEMINI_KEY_STORAGE, k);
    set({ geminiKey: k });
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
    parentNodeIds, elementIds, operator, styleTags = [], userPromptExtra,
    mode = "forge", intoNodeId, candidates = 2,
  }) {
    const { tree, nodes, elements, apiKey, modelId, providerChoice, geminiKey } = get();
    if (!tree) throw new Error("no tree loaded");
    if (providerChoice === "gemini" && !geminiKey) {
      set({ status: { phase: "error", message: "Gemini 需要自备 key（aistudio.google.com），去设置页贴入" } });
      return null;
    }
    if (providerChoice === "agnes" && !apiKey && !hasBuiltinChannel()) {
      set({ status: { phase: "error", message: "先去设置页贴入 Agnes API key（免费注册，key 只存你本地）" } });
      return null;
    }

    const recipe: Recipe = { parentNodeIds, elementIds, operator, styleTags, userPromptExtra, mode };

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
    const provider = providerChoice === "gemini"
      ? createGeminiProvider({ apiKey: geminiKey })
      : createAgnesProvider({ ...agnesChannel!, modelId });
    if (!provider.capabilities.supportedOperators.includes(operator)) {
      set({ status: { phase: "error", message: "该模型尚未掌握此禁术（spike 判定不达标）" } });
      return null;
    }

    const effectiveModelId = providerChoice === "gemini" ? GEMINI_DEFAULT_MODEL : modelId;
    const staticPrompt = buildPrompt(recipe);
    const outputs: Output[] = [];
    // 级联执行器的单步 runner：hash → data URI → 生成 → 存回 blob store
    const runner = {
      providerId: provider.id,
      modelId: effectiveModelId,
      maxInputImages: provider.capabilities.maxInputImages,
      async runStep(hashes: string[], stepPrompt: string) {
        // 1536px 上限：保融合细节的同时避免多 MB payload 触发上游断连
        const images = await Promise.all(hashes.map((h) => blobDataUriScaled(h, 1536)));
        const res = await provider.generate({ prompt: stepPrompt, images });
        return storeDataUri(res.image);
      },
    };

    // VLM director：一次调用产出 candidates 条互异设计方案（每候选一条）。
    // 失败/超时静默回退静态骨架，不增加锻造失败面。
    set({ status: { phase: "forging", candidate: 1, total: candidates } });
    let concepts: DirectorConcept[] | null = null;
    if (agnesChannel) {
      const director = createAgnesDirector(agnesChannel);
      // director 只需看懂内容，512px 大幅压 payload（大图是 chat 端点断连主因）
      const directorImages = await Promise.all(
        inputHashes
          .slice(0, provider.capabilities.maxInputImages)
          .map((h) => blobDataUriScaled(h, 512)),
      );
      concepts = await director
        .direct({
          operator, images: directorImages, count: candidates,
          styleFragments: styleFragments(styleTags), userPromptExtra,
        })
        .catch(() => null);
    }
    // subtract/intersect 只有 director 出的 prompt 才语义达标（spike 翻案结论），
    // 回退静态骨架必然出废图 → 直接中止
    if (!concepts && DIRECTOR_ONLY_OPERATORS.has(operator)) {
      set({ status: { phase: "error", message: "此禁术需要导演出手，但导演暂时联系不上——稍后再试" } });
      return null;
    }

    try {
      for (let i = 0; i < candidates; i++) {
        set({ status: { phase: "forging", candidate: i + 1, total: candidates } });
        const concept = concepts?.[i % concepts.length];
        const prompt = concept?.prompt ?? staticPrompt;
        const { outputHash, executionPlan } = await runCascade(inputHashes, prompt, runner);
        outputs.push({
          id: uuid(), imageHash: outputHash,
          executionPlan, providerId: provider.id, modelId: effectiveModelId, finalPrompt: prompt,
          ...(concept ? { conceptName: concept.name } : {}),
        });
      }
    } catch (e) {
      if (outputs.length === 0) {
        // 一张都没炼出来才算失败；炼出部分则带着已有成果落库
        if (e instanceof FurnaceOverheatError) {
          set({ status: { phase: "overheat", cooldownSeconds: e.cooldownSeconds } });
        } else {
          set({ status: { phase: "error", message: (e as Error).message } });
        }
        return null;
      }
    }

    const s = getStorage();
    let node: BlendNode;
    if (intoNodeId) {
      const existing = nodes.find((n) => n.id === intoNodeId);
      if (!existing) throw new Error("reroll target node not found");
      node = { ...existing, outputs: [...existing.outputs, ...outputs] };
    } else {
      node = {
        id: uuid(), recipe, outputs,
        canonicalOutputId: outputs[0]!.id, createdAt: Date.now(),
      };
    }
    await s.putNode(tree.id, node);
    if (!intoNodeId) {
      const next = { ...tree, nodeIds: [...tree.nodeIds, node.id], updatedAt: Date.now() };
      await s.putTree(next);
      set({ tree: next });
    }
    const rest = get().nodes.filter((n) => n.id !== node.id);
    set({ nodes: [...rest, node].sort((a, b) => a.createdAt - b.createdAt), status: { phase: "idle" } });
    return node;
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
