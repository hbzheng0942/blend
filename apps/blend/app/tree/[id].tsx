import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { BlendMode, OperatorId } from "@blend/core";
import { MAX_STYLE_TAGS, OPERATORS, STYLE_TAGS } from "@blend/core";
import { createAgnesProvider, createGeminiProvider } from "@blend/providers";
import { pickImageFiles } from "@/blobs";
import { exportPoster } from "@/poster";
import { exportRecipeCode } from "@/recipecode";
import { ForgeRitual } from "@/components/ForgeRitual";
import { HashImage } from "@/components/HashImage";
import { LineageCanvas } from "@/components/LineageCanvas";
import { useBlend } from "@/store";
import { display, kicker, theme } from "@/theme";

export default function Forge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    tree, nodes, elements, loadTree, addElementFromBlob, forge, canonize, moveNode,
    status, modelId, apiKey, providerChoice,
  } = useBlend();

  const [operator, setOperator] = useState<OperatorId>("fuse");
  const [extra, setExtra] = useState("");
  const [slotElementIds, setSlotElementIds] = useState<string[]>([]);
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [showStyles, setShowStyles] = useState(false);
  const [mode, setMode] = useState<BlendMode>("forge");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [codeMsg, setCodeMsg] = useState("");

  useEffect(() => {
    if (id) void loadTree(id);
  }, [id, loadTree]);

  // 默认选中最新节点作为下一轮 parent
  useEffect(() => {
    if (nodes.length && selectedIds.length === 0) {
      setSelectedIds([nodes[nodes.length - 1]!.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  const supported = useMemo(() => {
    const p = providerChoice === "gemini"
      ? createGeminiProvider({ apiKey: "x" })
      : createAgnesProvider({ apiKey: "x", modelId });
    return new Set(p.capabilities.supportedOperators);
  }, [modelId, providerChoice]);

  // 画布只显示真正入炉过的要素（上传后没用就删掉的不留痕）
  const canvasElements = useMemo(() => {
    const used = new Set(nodes.flatMap((n) => n.recipe.elementIds));
    return elements.filter((e) => used.has(e.id));
  }, [nodes, elements]);

  const forging = status.phase === "forging";
  const selectedNodes = selectedIds
    .map((sid) => nodes.find((n) => n.id === sid))
    .filter((n): n is NonNullable<typeof n> => !!n);
  const detailNode = selectedNodes.length === 1 ? selectedNodes[0]! : null;
  const isMerge = selectedNodes.length >= 2;
  const canForge = !forging && (slotElementIds.length > 0 || selectedNodes.length > 0);

  function toggleNode(nid: string) {
    setSelectedIds((cur) =>
      cur.includes(nid) ? cur.filter((x) => x !== nid) : [...cur.slice(-1), nid],
    );
  }

  async function addImages() {
    for (const f of await pickImageFiles()) {
      const el = await addElementFromBlob(f);
      setSlotElementIds((ids) => [...ids, el.id]);
    }
  }

  async function doForge() {
    const node = await forge({
      parentNodeIds: selectedNodes.map((n) => n.id),
      elementIds: slotElementIds,
      operator,
      styleTags,
      userPromptExtra: extra.trim() || undefined,
      mode,
    });
    if (node) {
      setSlotElementIds([]);
      setExtra("");
      setSelectedIds([node.id]);
    }
  }

  if (!tree) {
    return (
      <View style={[styles.page, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={theme.ember} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: tree.title }} />
      {/* ── 配方码重演绎指引 ── */}
      {tree.importedPlan && (
        <View style={styles.node}>
          <Text style={kicker(theme.textFaint)}>Recipe Replay</Text>
          <Text style={styles.nodeTitle}>重演绎「{tree.importedPlan.t}」— 用你自己的图走同一条配方</Text>
          <Text style={{ color: theme.textDim, fontSize: 12 }}>
            需要 {tree.importedPlan.e.length} 张要素图
            {tree.importedPlan.e.some((e) => e.label) &&
              "（" + tree.importedPlan.e.map((e, i) => e.label ?? "图" + (i + 1)).join("、") + "）"}
            ；按下面顺序锻造，第 {Math.min(nodes.length + 1, tree.importedPlan.s.length)}/
            {tree.importedPlan.s.length} 步：
          </Text>
          {tree.importedPlan.s.map((st, i) => {
            const op = OPERATORS.find((o) => o.id === st.o);
            const done = i < nodes.length;
            return (
              <Text
                key={i}
                style={{ color: done ? theme.textFaint : theme.text, fontSize: 13, marginTop: 2 }}
              >
                {done ? "✓" : i === nodes.length ? "▸" : " "} 第{i + 1}步 {op?.symbol}{" "}
                {op?.nameZh}
                {st.p.length > 0 && " · 基于第" + st.p.map((x) => x + 1).join("+") + "步"}
                {st.e.length > 0 && " · 投入" + st.e.map((x) => tree.importedPlan!.e[x]?.label ?? "图" + (x + 1)).join("、")}
                {st.s.length > 0 && " · 风格：" + st.s.map((t) => STYLE_TAGS.find((s) => s.id === t)?.nameZh ?? t).join("+")}
                {st.m === "recast" && " · 重铸"}
                {st.n ? ` ·〔${st.n}〕` : ""}
              </Text>
            );
          })}
        </View>
      )}

      {/* ── DAG 谱系画布 ── */}
      {(nodes.length > 0 || elements.length > 0) && (
        <View style={styles.canvasWrap}>
          <LineageCanvas
            nodes={nodes}
            elements={canvasElements}
            selectedIds={selectedIds}
            onToggleNode={toggleNode}
            layoutOverrides={tree.canvasLayout}
            onMoveNode={(nid, pos) => void moveNode(nid, pos)}
          />
          <Text style={styles.canvasHint}>
            点选节点继续锻造 fork · 选两个合并 merge · 拖动节点整理画布 · 虚线为过时结果
          </Text>
        </View>
      )}

      {/* ── 选中节点详情：候选管理 ── */}
      {detailNode && (
        <View style={styles.node}>
          <Text style={kicker(theme.textFaint)}>Candidates</Text>
          <Text style={styles.nodeTitle}>
            候选管理 · {OPERATORS.find((o) => o.id === detailNode.recipe.operator)?.symbol}{" "}
            {OPERATORS.find((o) => o.id === detailNode.recipe.operator)?.nameZh}
            {detailNode.recipe.styleTags.length > 0 &&
              " · 风格：" + detailNode.recipe.styleTags
                .map((t) => STYLE_TAGS.find((s) => s.id === t)?.nameZh).join("+")}
          </Text>
          <View style={styles.candidates}>
            {detailNode.outputs.map((o) => (
              <Pressable key={o.id} onPress={() => void canonize(detailNode.id, o.id)}>
                <HashImage hash={o.imageHash} size={148} selected={o.id === detailNode.canonicalOutputId} />
                {o.conceptName && (
                  <Text style={styles.candName} numberOfLines={1}>
                    {o.conceptName}
                  </Text>
                )}
                <Text style={styles.candLabel}>
                  {o.id === detailNode.canonicalOutputId ? "★ 已入谱" : "点选入谱"}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.rerollBtn}
              disabled={forging}
              onPress={() =>
                void forge({
                  parentNodeIds: detailNode.recipe.parentNodeIds,
                  elementIds: detailNode.recipe.elementIds,
                  operator: detailNode.recipe.operator,
                  styleTags: detailNode.recipe.styleTags,
                  userPromptExtra: detailNode.recipe.userPromptExtra,
                  mode: detailNode.recipe.mode,
                  intoNodeId: detailNode.id,
                })
              }
            >
              <Text style={{ color: theme.textDim, textAlign: "center" }}>♻️{"\n"}重roll</Text>
            </Pressable>
            <Pressable
              style={styles.rerollBtn}
              onPress={() => {
                const idx = nodes.findIndex((n) => n.id === detailNode.id);
                void exportPoster(tree, detailNode, "v" + (idx + 1)).catch(() => {});
              }}
            >
              <Text style={{ color: theme.textDim, textAlign: "center" }}>🖼{"\n"}卡面</Text>
            </Pressable>
            <Pressable
              style={styles.rerollBtn}
              onPress={async () => {
                try {
                  const code = await exportRecipeCode(tree.id, detailNode.id);
                  await navigator.clipboard.writeText(code);
                  setCodeMsg("配方码已复制（" + code.length + " 字符）——发给朋友重演绎吧");
                } catch (e) {
                  setCodeMsg("⚠️ " + (e as Error).message);
                }
              }}
            >
              <Text style={{ color: theme.textDim, textAlign: "center" }}>🧬{"\n"}配方码</Text>
            </Pressable>
          </View>
          {!!codeMsg && <Text style={{ color: theme.textDim, fontSize: 12 }}>{codeMsg}</Text>}
        </View>
      )}

      {/* ── 锻造面板 ── */}
      <View style={styles.panel}>
        <Text style={kicker(theme.textFaint)}>Forging Bench</Text>
        <Text style={styles.panelTitle}>
          {isMerge
            ? `合并锻造 — ${selectedNodes.length} 条支线熔为一炉`
            : selectedNodes.length === 1
              ? "在选中节点上继续锻造"
              : "根锻造 — 投入首批要素"}
        </Text>

        <View style={styles.slotRow}>
          {selectedNodes.map((n) => {
            const canonical = n.outputs.find((o) => o.id === n.canonicalOutputId);
            return canonical ? (
              <View key={n.id} style={{ alignItems: "center" }}>
                <HashImage hash={canonical.imageHash} size={72} selected />
                <Text style={styles.slotLabel}>parent</Text>
              </View>
            ) : null;
          })}
          {slotElementIds.map((eid, idx) => {
            const el = elements.find((e) => e.id === eid);
            return el ? (
              <View key={eid} style={{ alignItems: "center" }}>
                <Pressable onPress={() => setSlotElementIds((ids) => ids.filter((x) => x !== eid))}>
                  <HashImage hash={el.imageHash} size={72} />
                  <Text style={styles.slotLabel}>点击移除</Text>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                  <Pressable
                    hitSlop={6}
                    disabled={idx === 0}
                    onPress={() =>
                      setSlotElementIds((ids) => {
                        const next = [...ids];
                        [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                        return next;
                      })
                    }
                  >
                    <Text style={{ color: idx === 0 ? theme.border : theme.textDim, fontSize: 13 }}>◀</Text>
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    disabled={idx === slotElementIds.length - 1}
                    onPress={() =>
                      setSlotElementIds((ids) => {
                        const next = [...ids];
                        [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                        return next;
                      })
                    }
                  >
                    <Text style={{ color: idx === slotElementIds.length - 1 ? theme.border : theme.textDim, fontSize: 13 }}>▶</Text>
                  </Pressable>
                </View>
              </View>
            ) : null;
          })}
          <Pressable style={styles.addSlot} onPress={() => void addImages()}>
            <Text style={{ color: theme.textDim, fontSize: 26 }}>＋</Text>
          </Pressable>
        </View>

        <View style={styles.opRow}>
          {OPERATORS.map((op) => {
            const ok = supported.has(op.id);
            const active = operator === op.id;
            return (
              <Pressable
                key={op.id}
                disabled={!ok}
                onPress={() => setOperator(op.id)}
                style={[styles.opBtn, active && styles.opBtnActive, !ok && { opacity: 0.35 }]}
              >
                <Text style={styles.opSymbol}>{op.symbol}</Text>
                <Text style={styles.opName}>{op.nameZh}</Text>
                {!ok && <Text style={styles.opBan}>未掌握</Text>}
              </Pressable>
            );
          })}
        </View>
        {OPERATORS.find((o) => o.id === operator)?.hint && (
          <Text style={styles.hint}>💡 {OPERATORS.find((o) => o.id === operator)!.hint}</Text>
        )}

        {/* 风格 tags（折叠式，最多 3 个） */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => setShowStyles((v) => !v)}>
            <Text style={styles.stylesToggle}>
              {showStyles ? "▾" : "▸"} 风格{styleTags.length ? `（${styleTags.length}/${MAX_STYLE_TAGS}）` : ""}
              {styleTags.length > 0 &&
                "：" + styleTags.map((t) => STYLE_TAGS.find((s) => s.id === t)?.nameZh).join(" · ")}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              // 风格骰子：随机抽 2-3 个，倾向跨轴的怪异组合
              const shuffled = [...STYLE_TAGS].sort(() => Math.random() - 0.5);
              const n = Math.random() < 0.5 ? 2 : 3;
              const picked: typeof shuffled = [];
              for (const t of shuffled) {
                if (picked.length >= n) break;
                if (picked.some((x) => x.axis === t.axis) && Math.random() < 0.65) continue;
                picked.push(t);
              }
              setStyleTags(picked.map((t) => t.id));
              setShowStyles(true);
            }}
          >
            <Text style={{ color: theme.textDim, fontSize: 13 }}>🎲 天启骰</Text>
          </Pressable>
        </View>
        {showStyles && (
          <View style={styles.tagWrap}>
            {STYLE_TAGS.map((tag) => {
              const on = styleTags.includes(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  style={[styles.tag, on && styles.tagOn]}
                  onPress={() =>
                    setStyleTags((cur) =>
                      on ? cur.filter((t) => t !== tag.id)
                        : cur.length >= MAX_STYLE_TAGS ? cur : [...cur, tag.id],
                    )
                  }
                >
                  <Text style={{ color: on ? theme.text : theme.textDim, fontSize: 12 }}>
                    {tag.nameZh}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* forge / recast 模式 */}
        {selectedNodes.length > 0 && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([
              ["forge", "🔨 锻造", "喂上轮输出图继续炼，特征会渐变漂移"],
              ["recast", "♻️ 重铸", "回收谱系全部原始要素重新融合，高保真"],
            ] as const).map(([m, label, tip]) => (
              <Pressable
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnOn]}
                onPress={() => setMode(m)}
              >
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
                <Text style={{ color: theme.textDim, fontSize: 10, marginTop: 2 }}>{tip}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <TextInput
          style={styles.extraInput}
          value={extra}
          onChangeText={setExtra}
          placeholder="自由补充（可选）：e.g. glowing runes, studio light"
          placeholderTextColor={theme.textDim}
        />

        {status.phase === "forging" ? (
          <ForgeRitual
            symbol={OPERATORS.find((o) => o.id === operator)?.symbol ?? "⊕"}
            candidate={status.candidate}
            total={status.total}
          />
        ) : (
          <Pressable
            style={[styles.forgeBtn, !canForge && { opacity: 0.5 }]}
            disabled={!canForge}
            onPress={() => void doForge()}
          >
            <Text style={styles.forgeBtnText}>
              {isMerge ? "合并锻造 · 抽 2 张候选" : "锻造 · 抽 2 张候选"}
            </Text>
          </Pressable>
        )}

        {status.phase === "overheat" && (
          <Text style={styles.err}>🔥→❄️ 锻造炉过热：上游队列已满，请 {status.cooldownSeconds}s 后再试</Text>
        )}
        {status.phase === "error" && <Text style={styles.err}>⚠️ {status.message}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 16, maxWidth: 980, width: "100%", alignSelf: "center" },
  canvasWrap: {
    backgroundColor: theme.panel, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  canvasHint: { color: theme.textFaint, fontSize: 11, marginTop: 8, paddingHorizontal: 4, letterSpacing: 0.3 },
  node: {
    backgroundColor: theme.panel, borderRadius: 12, padding: 16, gap: 6,
    borderWidth: 1, borderColor: theme.border,
  },
  nodeTitle: { ...display(15), marginBottom: 8 },
  candidates: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  candLabel: { color: theme.textDim, fontSize: 12, textAlign: "center", marginTop: 4 },
  candName: {
    color: theme.text, fontSize: 11, fontStyle: "italic", textAlign: "center",
    marginTop: 5, maxWidth: 148,
  },
  rerollBtn: {
    width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderStyle: "dashed",
    borderColor: theme.border, alignItems: "center", justifyContent: "center",
  },
  panel: {
    backgroundColor: theme.panel, borderRadius: 12, padding: 18, gap: 12,
    borderWidth: 1, borderColor: theme.emberDim,
  },
  panelTitle: { ...display(17), marginTop: -4 },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "flex-start" },
  slotLabel: { color: theme.textDim, fontSize: 10, textAlign: "center", marginTop: 2 },
  addSlot: {
    width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderStyle: "dashed",
    borderColor: theme.textDim, alignItems: "center", justifyContent: "center",
  },
  opRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  opBtn: {
    backgroundColor: theme.card, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 15,
    alignItems: "center", borderWidth: 1, borderColor: theme.border, minWidth: 74,
  },
  opBtnActive: { borderColor: theme.ember, backgroundColor: theme.emberGlow },
  opSymbol: { ...display(21) },
  opName: { color: theme.textDim, fontSize: 11, marginTop: 3, letterSpacing: 1 },
  opBan: { color: theme.textFaint, fontSize: 9, letterSpacing: 1 },
  hint: { color: theme.textDim, fontSize: 12 },
  stylesToggle: { color: theme.text, fontSize: 13, fontWeight: "600" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    borderRadius: 14, paddingVertical: 5, paddingHorizontal: 11,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  tagOn: { borderColor: theme.ember, backgroundColor: theme.emberGlow },
  modeBtn: {
    flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: theme.border,
  },
  modeBtnOn: { borderColor: theme.ember },
  extraInput: {
    backgroundColor: theme.card, color: theme.text, borderRadius: 10,
    borderWidth: 1, borderColor: theme.border, padding: 10,
  },
  forgeBtn: {
    backgroundColor: theme.ember, borderRadius: 8, padding: 14, alignItems: "center",
  },
  forgeBtnText: { color: "#170f07", fontWeight: "700", fontSize: 14, letterSpacing: 1.5 },
  err: { color: theme.danger, fontSize: 13 },
});
