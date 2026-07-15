import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { BlendMode, BlendNode, OperatorId } from "@blend/core";
import { MAX_STYLE_TAGS, OPERATORS, STYLE_TAGS } from "@blend/core";
import { createAgnesProvider, createGeminiProvider } from "@blend/providers";
import { optimizeInputBlob, pickImageFiles } from "@/blobs";
import { downloadOutputImage, exportLineagePoster, exportPoster } from "@/poster";
import { exportRecipeCode } from "@/recipecode";
import { ChaosSlider } from "@/components/ChaosSlider";
import { ForgeRitual } from "@/components/ForgeRitual";
import { FurnaceFeed } from "@/components/FurnaceFeed";
import { HashImage } from "@/components/HashImage";
import { LineageCanvas } from "@/components/LineageCanvas";
import { OrganicBackdrop } from "@/components/OrganicBackdrop";
import { OutputLightbox } from "@/components/OutputLightbox";
import { useBlend } from "@/store";
import { display, kicker, theme } from "@/theme";

type Preview = { nodeId: string; outputId: string } | null;

export default function Forge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    tree, nodes, elements, loadTree, addElementFromBlob, forge, canonize, cancelForge,
    moveNode, status, modelId, providerChoice,
  } = useBlend();
  const { width: winW, height: winH } = useWindowDimensions();
  const wide = winW >= 900;

  const [operator, setOperator] = useState<OperatorId>("auto");
  const [chaos, setChaos] = useState(0.5);
  const [extra, setExtra] = useState("");
  const [slotElementIds, setSlotElementIds] = useState<string[]>([]);
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [showStyles, setShowStyles] = useState(false);
  const [showAlchemy, setShowAlchemy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState<BlendMode>("forge");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [activeParentIds, setActiveParentIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [notice, setNotice] = useState("");
  const hydratedTreeId = useRef<string | null>(null);

  useEffect(() => {
    if (id) void loadTree(id);
  }, [id, loadTree]);

  // 新谱系/预置案例首次进入时，把尚未使用的根素材直接放入当前炉槽。
  useEffect(() => {
    if (!tree || tree.id !== id || hydratedTreeId.current === tree.id) return;
    if (elements.length < tree.rootElementIds.length) return;
    hydratedTreeId.current = tree.id;
    if (!nodes.length && tree.rootElementIds.length) {
      const available = new Set(elements.map((element) => element.id));
      setSlotElementIds(tree.rootElementIds.filter((elementId) => available.has(elementId)));
      setNotice(`创世素材已就位 · ${tree.rootElementIds.length} 张`);
    }
  }, [elements, id, nodes.length, tree]);

  // 只在首次加载/新节点落库时补默认值；查看状态与入炉状态从此完全分离。
  useEffect(() => {
    if (!nodes.length) return;
    const newest = nodes[nodes.length - 1]!;
    setFocusedNodeId((current) => current ?? newest.id);
    setActiveParentIds((current) => current.length ? current : [newest.id]);
  }, [nodes.length]);

  const supported = useMemo(() => {
    const provider = providerChoice === "gemini"
      ? createGeminiProvider({ apiKey: "x" })
      : createAgnesProvider({ apiKey: "x", modelId });
    return new Set(provider.capabilities.supportedOperators);
  }, [modelId, providerChoice]);

  const canvasElements = useMemo(() => {
    const used = new Set(nodes.flatMap((node) => node.recipe.elementIds));
    return elements.filter((element) => used.has(element.id));
  }, [nodes, elements]);

  const activeParentNodes = activeParentIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is BlendNode => !!node);
  const forging = status.phase === "forging";
  const isMerge = activeParentNodes.length >= 2;
  const canForge = !forging && (slotElementIds.length > 0 || activeParentNodes.length > 0);
  const focusedNode = nodes.find((node) => node.id === focusedNodeId) ?? nodes[nodes.length - 1] ?? null;
  const versionForNode = (nodeId: string) => `v${nodes.findIndex((node) => node.id === nodeId) + 1}`;

  const addBlobs = useCallback(async (blobs: Blob[], source: "paste" | "picker") => {
    const imageBlobs = blobs.filter((blob) => blob.type.startsWith("image/"));
    if (!imageBlobs.length) return;
    setNotice(source === "paste" ? "正在接住剪贴板里的图…" : "正在整理素材…");
    const addedIds: string[] = [];
    for (const blob of imageBlobs) {
      try {
        const optimized = await optimizeInputBlob(blob);
        const element = await addElementFromBlob(optimized);
        addedIds.push(element.id);
      } catch {
        // 单张坏图不阻断同一批其他素材。
      }
    }
    if (!addedIds.length) {
      setNotice("没有读到可用图片 · 换一张再粘贴");
      return;
    }
    setSlotElementIds((current) => [...current, ...addedIds]);
    setNotice(`已投入 ${addedIds.length} 张图${source === "paste" ? " · 来自剪贴板" : ""}`);
  }, [addElementFromBlob]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onPaste = (event: ClipboardEvent) => {
      const blobs = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (!blobs.length) return;
      event.preventDefault();
      void addBlobs(blobs, "paste");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addBlobs]);

  async function addImages() {
    await addBlobs(await pickImageFiles(), "picker");
  }

  function continueFrom(nodeId: string) {
    setActiveParentIds([nodeId]);
    setFocusedNodeId(nodeId);
    setNotice("已把这条血统放进熔炉");
  }

  function toggleMergeParent(nodeId: string) {
    setActiveParentIds((current) => {
      if (current.includes(nodeId)) return current.filter((id) => id !== nodeId);
      return [...current.slice(-1), nodeId];
    });
  }

  async function doForge() {
    const node = await forge({
      parentNodeIds: activeParentNodes.map((parent) => parent.id),
      elementIds: slotElementIds,
      operator, styleTags,
      userPromptExtra: extra.trim() || undefined,
      chaos, mode,
    });
    if (!node) return;
    setSlotElementIds([]);
    setExtra("");
    setFocusedNodeId(node.id);
    setActiveParentIds([node.id]);
    setNotice("新异变体已出炉 · 点击大图查看细节");
  }

  function reroll(node: BlendNode) {
    void forge({
      parentNodeIds: node.recipe.parentNodeIds,
      elementIds: node.recipe.elementIds,
      operator: node.recipe.operator,
      styleTags: node.recipe.styleTags,
      userPromptExtra: node.recipe.userPromptExtra,
      chaos: node.recipe.chaos,
      mode: node.recipe.mode,
      intoNodeId: node.id,
    });
  }

  async function copyRecipe(nodeId: string) {
    try {
      const code = await exportRecipeCode(tree!.id, nodeId);
      await navigator.clipboard.writeText(code);
      setNotice(`配方码已复制 · ${code.length} 字符`);
    } catch (error) {
      setNotice(`⚠ ${(error as Error).message}`);
    }
  }

  if (!tree) {
    return <View style={styles.loading}><ActivityIndicator color={theme.ember} /></View>;
  }

  const previewNode = preview ? nodes.find((node) => node.id === preview.nodeId) : null;

  const replayGuide = tree.importedPlan ? (
    <View style={styles.replayCard}>
      <Text style={kicker(theme.spore)}>Recipe organism</Text>
      <Text style={styles.replayTitle}>重演绎「{tree.importedPlan.t}」</Text>
      <Text style={styles.replayCopy}>
        需要 {tree.importedPlan.e.length} 张要素图 · 当前第 {Math.min(nodes.length + 1, tree.importedPlan.s.length)}/{tree.importedPlan.s.length} 步
      </Text>
      {tree.importedPlan.s.map((step, index) => {
        const op = OPERATORS.find((item) => item.id === step.o);
        const done = index < nodes.length;
        return (
          <Text key={index} style={{ color: done ? theme.textFaint : index === nodes.length ? theme.text : theme.textDim, fontSize: 11, marginTop: 4 }}>
            {done ? "✓" : index === nodes.length ? "●" : "○"} {op?.symbol} {op?.nameZh}
            {step.e.length ? ` · ${step.e.map((elementIndex) => tree.importedPlan!.e[elementIndex]?.label ?? `图${elementIndex + 1}`).join(" + ")}` : ""}
          </Text>
        );
      })}
    </View>
  ) : null;

  const feedActions = {
      focusedNodeId,
      activeParentIds,
      forging,
      onFocus: setFocusedNodeId,
      onPreview: (nodeId: string, outputId: string) => setPreview({ nodeId, outputId }),
      onCanonize: (nodeId: string, outputId: string) => void canonize(nodeId, outputId),
      onContinue: continueFrom,
      onToggleMerge: toggleMergeParent,
      onReroll: reroll,
      onPoster: (node: BlendNode, version: string) => void exportPoster(tree, node, version).catch(() => {}),
      onLineagePoster: (nodeId: string) => void exportLineagePoster(tree, nodes, elements, nodeId).catch(() => {}),
      onRecipeCode: (nodeId: string) => void copyRecipe(nodeId),
      versionForNode,
  };

  const currentOutput = focusedNode ? (
    <View style={styles.currentBlock}>
      <View style={styles.sectionLabel}>
        <Text style={kicker(theme.text)}>STEP 01 / CHOOSE</Text>
        <Text style={styles.sectionHint}>当前产物 · 点图看细节</Text>
      </View>
      <FurnaceFeed
        nodes={[focusedNode]}
        showHeader={false}
        embedded
        {...feedActions}
      />
    </View>
  ) : null;

  const historyNodes = nodes.filter((node) => node.id !== focusedNode?.id);
  const history = historyNodes.length ? (
    <View style={styles.historyBlock}>
      <Pressable onPress={() => setShowHistory((value) => !value)} style={styles.historyToggle}>
        <View>
          <Text style={kicker(theme.textFaint)}>ARCHIVE / {String(historyNodes.length).padStart(2, "0")}</Text>
          <Text style={styles.historyTitle}>历史记录</Text>
        </View>
        <Text style={styles.historyAction}>{showHistory ? "收起 ↑" : "展开 ↓"}</Text>
      </Pressable>
      {showHistory && <View style={styles.historyFeed}><FurnaceFeed nodes={historyNodes} showHeader={false} {...feedActions} /></View>}
    </View>
  ) : null;

  const forgePanel = (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <View>
          <Text style={kicker(theme.text)}>{focusedNode ? "STEP 02 / MUTATE" : "STEP 01 / INPUT"}</Text>
          <Text style={styles.panelTitle}>{isMerge ? "两条血统正在靠近" : activeParentNodes.length ? "继续喂养这条血统" : "投入第一批原料"}</Text>
        </View>
        <View style={styles.liveDot}><View style={styles.liveDotCore} /></View>
      </View>

      <View style={styles.slotRow}>
        {activeParentNodes.map((node) => {
          const canonical = node.outputs.find((output) => output.id === node.canonicalOutputId);
          return canonical ? (
            <Pressable key={node.id} onPress={() => toggleMergeParent(node.id)} style={styles.slot}>
              <HashImage hash={canonical.imageHash} size={68} selected />
              <Text style={styles.slotLabel}>血统 · 点击移出</Text>
            </Pressable>
          ) : null;
        })}
        {slotElementIds.map((elementId, index) => {
          const element = elements.find((item) => item.id === elementId);
          return element ? (
            <View key={elementId} style={styles.slot}>
              <Pressable onPress={() => setSlotElementIds((ids) => ids.filter((id) => id !== elementId))}>
                <HashImage hash={element.imageHash} size={68} />
                <Text style={styles.slotLabel}>素材 · 点击移除</Text>
              </Pressable>
              <View style={styles.reorderRow}>
                <Pressable disabled={index === 0} onPress={() => setSlotElementIds((ids) => move(ids, index, index - 1))}><Text style={styles.reorder}>←</Text></Pressable>
                <Pressable disabled={index === slotElementIds.length - 1} onPress={() => setSlotElementIds((ids) => move(ids, index, index + 1))}><Text style={styles.reorder}>→</Text></Pressable>
              </View>
            </View>
          ) : null;
        })}
        <Pressable accessibilityRole="button" style={styles.addSlot} onPress={() => void addImages()}>
          <Text style={styles.addPlus}>＋</Text>
          <Text style={styles.addLabel}>上传</Text>
          <Text style={styles.pasteLabel}>或 ⌘V 粘贴</Text>
        </Pressable>
      </View>

      {!!notice && <Text style={styles.notice}>● {notice}</Text>}

      <Pressable onPress={() => setShowAlchemy((value) => !value)} style={styles.alchemyToggle}>
        <View>
          <Text style={styles.alchemyTitle}>{operator === "auto" ? "✦ 导演自动配方" : `${OPERATORS.find((item) => item.id === operator)?.symbol} ${OPERATORS.find((item) => item.id === operator)?.nameZh}`}</Text>
          <Text style={styles.alchemySummary}>{styleTags.length ? styleTags.map((id) => STYLE_TAGS.find((tag) => tag.id === id)?.nameZh).join(" + ") : "平衡异变 · 无额外风格"}</Text>
        </View>
        <Text style={{ color: theme.textDim, fontSize: 18 }}>{showAlchemy ? "−" : "+"}</Text>
      </Pressable>

      {showAlchemy && (
        <View style={styles.alchemyBody}>
          <View style={styles.opRow}>
            {OPERATORS.map((op) => {
              const ok = supported.has(op.id);
              const active = operator === op.id;
              return (
                <Pressable key={op.id} disabled={!ok} onPress={() => setOperator(op.id)} style={[styles.opBtn, active && styles.opBtnActive, !ok && { opacity: 0.3 }]}>
                  <Text style={styles.opSymbol}>{op.symbol}</Text>
                  <Text style={styles.opName}>{op.nameZh}</Text>
                </Pressable>
              );
            })}
          </View>
          {OPERATORS.find((item) => item.id === operator)?.hint && <Text style={styles.hint}>↳ {OPERATORS.find((item) => item.id === operator)!.hint}</Text>}
          <ChaosSlider value={chaos} onChange={setChaos} />

          <View style={styles.styleHead}>
            <Pressable onPress={() => setShowStyles((value) => !value)}><Text style={styles.stylesToggle}>{showStyles ? "▾" : "▸"} 异变材质 {styleTags.length ? `${styleTags.length}/${MAX_STYLE_TAGS}` : ""}</Text></Pressable>
            <Pressable onPress={() => {
              const shuffled = [...STYLE_TAGS].sort(() => Math.random() - 0.5);
              setStyleTags(shuffled.slice(0, 2 + (Math.random() > 0.5 ? 1 : 0)).map((tag) => tag.id));
              setShowStyles(true);
            }}><Text style={styles.dice}>⚄ 天启骰</Text></Pressable>
          </View>
          {showStyles && <View style={styles.tagWrap}>{STYLE_TAGS.map((tag) => {
            const on = styleTags.includes(tag.id);
            return <Pressable key={tag.id} style={[styles.tag, on && styles.tagOn]} onPress={() => setStyleTags((current) => on ? current.filter((id) => id !== tag.id) : current.length >= MAX_STYLE_TAGS ? current : [...current, tag.id])}><Text style={{ color: on ? theme.spore : theme.textDim, fontSize: 11 }}>{tag.nameZh}</Text></Pressable>;
          })}</View>}

          {activeParentNodes.length > 0 && <View style={{ flexDirection: "row", gap: 8 }}>
            {([[
              "forge", "锻造", "沿上轮继续漂移",
            ], ["recast", "重铸", "召回全部原始要素"]] as const).map(([value, label, tip]) => (
              <Pressable key={value} onPress={() => setMode(value)} style={[styles.modeBtn, mode === value && styles.modeBtnOn]}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 12 }}>{label}</Text>
                <Text style={{ color: theme.textFaint, fontSize: 9, marginTop: 3 }}>{tip}</Text>
              </Pressable>
            ))}
          </View>}

          <TextInput style={styles.extraInput} value={extra} onChangeText={setExtra} placeholder="再低语一句：会发光、像古生物、结构更疯狂…" placeholderTextColor={theme.textFaint} />
        </View>
      )}

      {status.phase === "forging" ? (
        <ForgeRitual symbol={OPERATORS.find((item) => item.id === operator)?.symbol ?? "⊕"} done={status.done} total={status.total} conceptNames={status.conceptNames} directorMode={status.directorMode} onAbort={cancelForge} />
      ) : (
        <Pressable disabled={!canForge} onPress={() => void doForge()} style={[styles.forgeBtn, !canForge && { opacity: 0.42 }]}>
          <View style={styles.forgeCore}><Text style={styles.forgeSymbol}>{isMerge ? "∞" : "✦"}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.forgeBtnText}>{isMerge ? "让两条血统发生碰撞" : "点火，让导演给出异变方案"}</Text>
            <Text style={styles.forgeSub}>导演给几套就炼几套 · 离线时只炼一套</Text>
          </View>
          <Text style={styles.forgeArrow}>↗</Text>
        </Pressable>
      )}
      {status.phase === "overheat" && <Text style={styles.err}>🔥→❄ 炉温过高 · {status.cooldownSeconds}s 后再试</Text>}
      {status.phase === "error" && <Text style={styles.err}>⚠ {status.message}</Text>}
    </View>
  );

  const workbench = (
    <View style={styles.workbench}>
      {currentOutput}
      {forgePanel}
    </View>
  );

  const canvas = (
    <View style={styles.canvasShell}>
      <View style={[styles.canvasField, canvasFieldWeb]} />
      <View style={styles.axisX} />
      <View style={styles.axisY} />
      <View style={styles.canvasHeader}>
        <View>
          <Text style={kicker(theme.textFaint)}>LINEAGE MAP</Text>
          <Text style={display(18)}>谱系图</Text>
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: theme.ember }]} /><Text style={styles.legendText}>正在查看</Text>
          <View style={[styles.legendDot, { backgroundColor: theme.spore }]} /><Text style={styles.legendText}>已入炉</Text>
        </View>
      </View>
      {nodes.length || canvasElements.length ? (
        <View style={{ flex: 1 }}>
          <LineageCanvas
            nodes={nodes}
            elements={canvasElements}
            focusedNodeId={focusedNodeId}
            activeParentIds={activeParentIds}
            onFocusNode={setFocusedNodeId}
            layoutOverrides={tree.canvasLayout}
            onMoveNode={(nodeId, position) => void moveNode(nodeId, position)}
            viewportHeight={wide ? winH - 112 : undefined}
          />
          <Text style={styles.canvasHint}>点击只查看 · 在左侧明确选择“继续炼/加入合并” · 拖动整理菌丝位置</Text>
        </View>
      ) : (
        <View style={styles.emptyCanvas}>
          <View style={styles.dormantSystem}>
            <View style={[styles.orbitOuter, orbitOuterMotion]}><View style={styles.orbitPixel} /></View>
            <View style={[styles.orbitInner, orbitInnerMotion]}><View style={styles.orbitPixelInner} /></View>
            <View style={styles.emptyOrganism}><View style={[styles.emptyNucleus, dormantMotion]} /></View>
          </View>
          <Text style={kicker(theme.textFaint)}>DORMANT LIFEFORM / 000</Text>
          <Text style={styles.emptyCanvasText}>投入图像，启动第一次生命碰撞</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.shell}>
      <Stack.Screen options={{ headerShown: false, title: tree.title }} />
      <OrganicBackdrop />

      {wide ? (
        <>
          <View style={styles.leftPane}>
            <View style={styles.topBar}>
              <Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={{ color: theme.text, fontSize: 18 }}>←</Text></Pressable>
              <View style={{ flex: 1 }}><Text style={kicker(theme.spore)}>Blend organism no.{tree.id.slice(0, 4)}</Text><Text style={styles.treeTitle} numberOfLines={1}>{tree.title}</Text></View>
            </View>
            <ScrollView style={styles.leftScroll} contentContainerStyle={styles.leftContent}>
              {replayGuide}{workbench}{history}
            </ScrollView>
          </View>
          <View style={styles.rightPane}>{canvas}</View>
        </>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 14 }}>
          <View style={styles.topBar}><Pressable onPress={() => router.back()} style={styles.backBtn}><Text style={{ color: theme.text }}>←</Text></Pressable><Text style={styles.treeTitle}>{tree.title}</Text></View>
          {canvas}{replayGuide}{workbench}{history}
        </ScrollView>
      )}

      {preview && previewNode && (
        <OutputLightbox
          outputs={previewNode.outputs}
          initialOutputId={preview.outputId}
          canonicalOutputId={previewNode.canonicalOutputId}
          onClose={() => setPreview(null)}
          onCanonize={(outputId) => void canonize(previewNode.id, outputId)}
          onDownload={(output) => void downloadOutputImage(output.imageHash, `${tree.title}-${output.conceptName ?? output.id.slice(0, 6)}.png`).catch(() => {})}
        />
      )}
    </View>
  );
}

function move(ids: string[], from: number, to: number): string[] {
  if (to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

const canvasFieldWeb = {
  backgroundImage: "radial-gradient(rgba(255,255,255,.48) 1px, transparent 1.5px)",
  backgroundSize: "12px 12px",
  maskImage: "radial-gradient(circle at 50% 54%, black, transparent 64%)",
  animation: "blend-field-shift 9s steps(9,end) infinite",
} as object;
const orbitOuterMotion = { animation: "blend-orbit 18s steps(48,end) infinite" } as object;
const orbitInnerMotion = { animation: "blend-orbit-reverse 11s steps(36,end) infinite" } as object;
const dormantMotion = { animation: "blend-dormant 2.6s steps(8,end) infinite" } as object;

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  shell: { flex: 1, flexDirection: "row", backgroundColor: theme.bg, overflow: "hidden" },
  leftPane: { width: 570, height: "100%", borderRightWidth: 1, borderColor: theme.border, backgroundColor: "rgba(0,0,0,.88)" },
  rightPane: { flex: 1, padding: 12 },
  topBar: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: theme.border },
  backBtn: { width: 38, height: 38, borderWidth: 1, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center" },
  treeTitle: { ...display(17), marginTop: 2 },
  leftScroll: { flex: 1 },
  leftContent: { padding: 12, paddingBottom: 48, gap: 12 },
  workbench: { padding: 14, gap: 16, backgroundColor: "rgba(7,7,7,.94)", borderWidth: 1, borderColor: theme.borderStrong },
  currentBlock: { gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderColor: theme.border },
  sectionLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 },
  sectionHint: { color: theme.textFaint, fontSize: 9 },
  historyBlock: { marginTop: 4, borderTopWidth: 1, borderColor: theme.border },
  historyToggle: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingVertical: 12 },
  historyTitle: { ...display(15), marginTop: 4, color: theme.textDim },
  historyAction: { color: theme.textDim, fontSize: 11 },
  historyFeed: { gap: 8, paddingBottom: 10 },
  replayCard: { padding: 14, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.emberGlow },
  replayTitle: { ...display(16), marginTop: 4 },
  replayCopy: { color: theme.textDim, fontSize: 11, marginTop: 6 },
  panel: { gap: 11 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitle: { ...display(18), marginTop: 3 },
  liveDot: { width: 28, height: 28, borderWidth: 1, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center" },
  liveDotCore: { width: 8, height: 8, backgroundColor: theme.ember },
  slotRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 9 },
  slot: { alignItems: "center" },
  slotLabel: { color: theme.textFaint, fontSize: 9, marginTop: 3, textAlign: "center" },
  reorderRow: { flexDirection: "row", gap: 14, marginTop: 2 },
  reorder: { color: theme.textDim, fontSize: 12 },
  addSlot: { width: 92, height: 92, borderWidth: 1, borderStyle: "dashed", borderColor: theme.borderStrong, backgroundColor: theme.emberGlow, alignItems: "center", justifyContent: "center" },
  addPlus: { color: theme.spore, fontSize: 24, lineHeight: 25 },
  addLabel: { color: theme.text, fontSize: 11, fontWeight: "700" },
  pasteLabel: { color: theme.textFaint, fontSize: 9, marginTop: 2 },
  notice: { color: theme.spore, fontSize: 10 },
  alchemyToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: theme.border, paddingTop: 10 },
  alchemyTitle: { color: theme.text, fontSize: 12, fontWeight: "700" },
  alchemySummary: { color: theme.textFaint, fontSize: 9, marginTop: 3 },
  alchemyBody: { gap: 10 },
  opRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  opBtn: { minWidth: 63, paddingVertical: 7, paddingHorizontal: 10, alignItems: "center", backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
  opBtnActive: { borderColor: theme.text, backgroundColor: theme.emberGlow },
  opSymbol: { ...display(18) },
  opName: { color: theme.textDim, fontSize: 9, marginTop: 2 },
  hint: { color: theme.textFaint, fontSize: 10, lineHeight: 15 },
  styleHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stylesToggle: { color: theme.text, fontSize: 11, fontWeight: "700" },
  dice: { color: theme.spore, fontSize: 11 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card },
  tagOn: { borderColor: theme.text, backgroundColor: theme.emberGlow },
  modeBtn: { flex: 1, padding: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card },
  modeBtnOn: { borderColor: theme.ember },
  extraInput: { color: theme.text, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 11 },
  forgeBtn: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, padding: 10, backgroundColor: theme.ember },
  forgeCore: { width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.08)", borderWidth: 1, borderColor: "rgba(0,0,0,.24)" },
  forgeSymbol: { color: "#050505", fontSize: 22, fontWeight: "800" },
  forgeBtnText: { color: "#050505", fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },
  forgeSub: { color: "rgba(0,0,0,.58)", fontSize: 9, marginTop: 3 },
  forgeArrow: { color: "#050505", fontSize: 20, marginRight: 7 },
  err: { color: theme.danger, fontSize: 11 },
  canvasShell: { flex: 1, backgroundColor: "rgba(3,3,3,.78)", borderWidth: 1, borderColor: theme.border, overflow: "hidden", padding: 13 },
  canvasField: { position: "absolute", inset: 0, opacity: 0.24 } as object,
  axisX: { position: "absolute", left: 0, right: 0, top: "54%", height: 1, backgroundColor: theme.border },
  axisY: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: theme.border },
  canvasHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 5, paddingBottom: 10 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 9 },
  legendText: { color: theme.textFaint, fontSize: 9 },
  canvasHint: { color: theme.textFaint, fontSize: 10, paddingHorizontal: 5, paddingTop: 8 },
  emptyCanvas: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center", gap: 12 },
  dormantSystem: { width: 260, height: 260, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  orbitOuter: { position: "absolute", width: 238, height: 238, borderRadius: 119, borderWidth: 1, borderColor: theme.borderStrong, borderStyle: "dashed" },
  orbitInner: { position: "absolute", width: 168, height: 168, borderRadius: 84, borderWidth: 1, borderColor: theme.border },
  orbitPixel: { position: "absolute", width: 10, height: 10, backgroundColor: theme.text, left: 23, top: 16 },
  orbitPixelInner: { position: "absolute", width: 7, height: 7, backgroundColor: theme.textDim, right: 14, bottom: 28 },
  emptyOrganism: { width: 96, height: 96, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.emberGlow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }] },
  emptyNucleus: { width: 28, height: 28, backgroundColor: theme.ember, opacity: 0.75 },
  emptyCanvasText: { color: theme.textFaint, fontSize: 11 },
});
