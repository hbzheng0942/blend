import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BlendNode } from "@blend/core";
import { OPERATORS, STYLE_TAGS } from "@blend/core";
import { HashImage } from "./HashImage";
import { display, kicker, theme } from "@/theme";

export function FurnaceFeed({
  nodes, focusedNodeId, activeParentIds, forging,
  onFocus, onPreview, onCanonize, onContinue, onToggleMerge,
  onReroll, onPoster, onLineagePoster, onRecipeCode,
  showHeader = true, versionForNode, embedded = false,
}: {
  nodes: BlendNode[];
  focusedNodeId: string | null;
  activeParentIds: string[];
  forging: boolean;
  onFocus: (nodeId: string) => void;
  onPreview: (nodeId: string, outputId: string) => void;
  onCanonize: (nodeId: string, outputId: string) => void;
  onContinue: (nodeId: string) => void;
  onToggleMerge: (nodeId: string) => void;
  onReroll: (node: BlendNode) => void;
  onPoster: (node: BlendNode, version: string) => void;
  onLineagePoster: (nodeId: string) => void;
  onRecipeCode: (nodeId: string) => void;
  showHeader?: boolean;
  versionForNode?: (nodeId: string) => string;
  embedded?: boolean;
}) {
  if (nodes.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.seed} />
        <Text style={kicker(theme.spore)}>No specimens yet</Text>
        <Text style={display(21)}>第一条血统，等你点火</Text>
        <Text style={styles.emptyText}>上传或直接粘贴图片。越不相干，越可能炼出奇怪东西。</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {showHeader && <View style={styles.feedHeader}>
        <View>
          <Text style={kicker(theme.textFaint)}>ARCHIVE</Text>
          <Text style={display(18)}>历史产物</Text>
        </View>
        <Text style={styles.count}>{nodes.length} 代</Text>
      </View>}

      {[...nodes].reverse().map((node) => {
        const originalIndex = nodes.findIndex((n) => n.id === node.id);
        const version = versionForNode?.(node.id) ?? `v${originalIndex + 1}`;
        const focused = node.id === focusedNodeId;
        const active = activeParentIds.includes(node.id);
        const canonical = node.outputs.find((o) => o.id === node.canonicalOutputId);
        const op = OPERATORS.find((o) => o.id === node.recipe.operator);
        const stylesText = node.recipe.styleTags
          .map((id) => STYLE_TAGS.find((tag) => tag.id === id)?.nameZh)
          .filter(Boolean)
          .join(" + ");
        const fallbackName = `${stylesText.split(" + ")[0] || "未知"}${op?.nameZh ?? "异变"}体`.slice(0, 6);

        return (
          <View key={node.id} style={[styles.round, embedded && styles.roundEmbedded, focused && !embedded && styles.roundFocused, active && !embedded && styles.roundActive, active && !embedded && ({ boxShadow: `0 0 18px ${theme.sporeDim}` } as object)]}>
            <Pressable accessibilityRole="button" onPress={() => onFocus(node.id)} style={styles.roundHeader}>
              <View style={styles.versionOrb}>
                <Text style={{ ...display(12), color: active ? "#050505" : theme.text }}>{version}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roundTitle}>{op?.symbol} {op?.nameZh}{node.recipe.mode === "recast" ? " · 重铸" : ""}</Text>
                <Text style={styles.roundMeta}>{node.outputs.length} 次出炉{stylesText ? ` · ${stylesText}` : ""}</Text>
              </View>
              {active && <Text style={kicker(theme.spore)}>SELECTED</Text>}
              <Text style={{ color: theme.textFaint, fontSize: 18 }}>{focused ? "−" : "+"}</Text>
            </Pressable>

            {!focused && canonical && (
              <Pressable onPress={() => onPreview(node.id, canonical.id)} style={styles.collapsedResult}>
                <HashImage hash={canonical.imageHash} size={68} selected={active} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.concept}>{canonical.conceptName ?? fallbackName}</Text>
                  {!!canonical.conceptEquation && <Text style={styles.equation} numberOfLines={1}>{canonical.conceptEquation}</Text>}
                  <Text style={styles.peek}>点击查看本代产物 · 展开可看全部候选</Text>
                </View>
              </Pressable>
            )}

            {focused && (
              <>
                <View style={styles.candidates}>
                  {node.outputs.map((output) => (
                    <View key={output.id} style={styles.candidate}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`预览 ${output.conceptName ?? "候选"}`}
                        onPress={() => onPreview(node.id, output.id)}
                        style={({ pressed }) => [styles.imageButton, pressed && { opacity: 0.78 }]}
                      >
                        <HashImage hash={output.imageHash} size={176} selected={output.id === node.canonicalOutputId} />
                        <View style={styles.zoomBadge}><Text style={styles.zoomText}>↗ 预览</Text></View>
                      </Pressable>
                      <View style={styles.conceptHead}>
                        <Text style={styles.concept} numberOfLines={1}>{output.conceptName ?? fallbackName}</Text>
                        {output.conceptSource === "fallback" && <Text style={styles.fallbackBadge}>单方案</Text>}
                      </View>
                      {!!output.conceptEquation && <Text style={styles.equation} numberOfLines={2}>◈ {output.conceptEquation}</Text>}
                      <Pressable
                        onPress={() => onCanonize(node.id, output.id)}
                        style={[styles.canonBtn, output.id === node.canonicalOutputId && styles.canonBtnOn]}
                      >
                        <Text style={{ color: output.id === node.canonicalOutputId ? theme.spore : theme.textDim, fontSize: 11, fontWeight: "700" }}>
                          {output.id === node.canonicalOutputId ? "★ 本代产物" : "选为本代"}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>

                <View style={styles.primaryActions}>
                  <Pressable onPress={() => onContinue(node.id)} style={styles.continueBtn}>
                    <Text style={styles.continueText}>沿这条血统继续炼 →</Text>
                  </Pressable>
                  <Pressable onPress={() => onToggleMerge(node.id)} style={[styles.mergeBtn, active && styles.mergeBtnOn]}>
                    <Text style={{ color: active ? theme.spore : theme.textDim, fontSize: 12 }}>
                      {active ? "移出熔炉" : "＋ 加入合并"}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.toolRow}>
                  <Tool label="♻ 重抽" disabled={forging} onPress={() => onReroll(node)} />
                  <Tool label="卡面" onPress={() => onPoster(node, version)} />
                  <Tool label="谱系卡" onPress={() => onLineagePoster(node.id)} />
                  <Tool label="配方码" onPress={() => onRecipeCode(node.id)} />
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Tool({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.tool, disabled && { opacity: 0.45 }]}>
      <Text style={{ color: theme.textDim, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  feedHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 2 },
  count: { color: theme.textFaint, fontSize: 11 },
  empty: { minHeight: 190, alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: "rgba(7,7,7,.88)", borderWidth: 1, borderColor: theme.border, overflow: "hidden", padding: 24 },
  seed: { width: 44, height: 44, backgroundColor: theme.sporeDim, borderWidth: 1, borderColor: theme.spore },
  emptyText: { color: theme.textDim, fontSize: 12, lineHeight: 19, textAlign: "center", maxWidth: 320 },
  round: {
    padding: 12, backgroundColor: "rgba(7,7,7,.92)", borderWidth: 1, borderColor: theme.border,
  },
  roundEmbedded: { padding: 0, backgroundColor: "transparent", borderWidth: 0 },
  roundFocused: { borderColor: theme.borderStrong, backgroundColor: "rgba(16,16,16,.96)" },
  roundActive: { borderColor: theme.spore },
  roundHeader: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  versionOrb: { width: 38, height: 38, backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  roundTitle: { ...display(14), fontWeight: "600" },
  roundMeta: { color: theme.textFaint, fontSize: 10, marginTop: 3 },
  collapsedResult: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  conceptHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 7 },
  concept: { color: theme.text, fontSize: 13, fontStyle: "italic", maxWidth: 132 },
  equation: { color: theme.textDim, fontSize: 9, lineHeight: 14, marginTop: 5 },
  fallbackBadge: { color: theme.textFaint, fontSize: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 4, paddingVertical: 2 },
  peek: { color: theme.textFaint, fontSize: 10, marginTop: 5 },
  candidates: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  candidate: { width: 176, alignItems: "stretch" },
  imageButton: { position: "relative" },
  zoomBadge: { position: "absolute", right: 7, bottom: 7, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: "rgba(0,0,0,.82)", borderWidth: 1, borderColor: theme.borderStrong },
  zoomText: { color: theme.text, fontSize: 9, fontWeight: "700" },
  canonBtn: { marginTop: 7, alignItems: "center", paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  canonBtnOn: { borderColor: theme.borderStrong, backgroundColor: theme.emberGlow },
  primaryActions: { flexDirection: "row", gap: 8, marginTop: 13 },
  continueBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: theme.ember, alignItems: "center" },
  continueText: { color: "#050505", fontSize: 12, fontWeight: "800" },
  mergeBtn: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.borderStrong },
  mergeBtnOn: { borderColor: theme.text, backgroundColor: theme.emberGlow },
  toolRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 9 },
  tool: { paddingVertical: 7, paddingHorizontal: 10, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
});
