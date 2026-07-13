import { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { BlendNode, Element } from "@blend/core";
import { OPERATORS, isNodeStale } from "@blend/core";
import { display, kicker, theme } from "@/theme";
import { HashImage } from "./HashImage";

/** DAG 谱系画布（ADR 001：View 节点 + SVG 边）。自动分层布局。 */

const CARD_W = 104;
const CARD_H = 136;
const EL_SIZE = 44;
const H_GAP = 28;
const V_GAP = 56;
const PAD = 20;

interface Pos { x: number; y: number }

function layout(nodes: BlendNode[], elements: Element[], overrides: Record<string, Pos>) {
  const level = new Map<string, number>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (id: string): number => {
    const hit = level.get(id);
    if (hit !== undefined) return hit;
    const n = byId.get(id);
    const d = n && n.recipe.parentNodeIds.length
      ? 1 + Math.max(...n.recipe.parentNodeIds.map(depth))
      : 1;
    level.set(id, d);
    return d;
  };
  nodes.forEach((n) => depth(n.id));

  const elPos = new Map<string, Pos>();
  elements.forEach((e, i) => elPos.set(e.id, { x: PAD + i * (EL_SIZE + 16), y: PAD }));

  const rows = new Map<number, string[]>();
  for (const n of nodes) {
    const d = level.get(n.id)!;
    rows.set(d, [...(rows.get(d) ?? []), n.id]);
  }
  const nodePos = new Map<string, Pos>();
  for (const [d, ids] of rows) {
    ids.forEach((id, i) => {
      nodePos.set(id, {
        x: PAD + i * (CARD_W + H_GAP),
        y: PAD + EL_SIZE + V_GAP / 2 + (d - 1) * (CARD_H + V_GAP),
      });
    });
  }
  // 手动拖拽过的节点用持久化位置覆盖自动布局
  for (const [id, p] of Object.entries(overrides)) {
    if (nodePos.has(id)) nodePos.set(id, { x: Math.max(0, p.x), y: Math.max(0, p.y) });
  }
  const maxLevel = Math.max(0, ...rows.keys());
  let width = PAD * 2 + Math.max(
    elements.length * (EL_SIZE + 16),
    ...[...rows.values()].map((ids) => ids.length * (CARD_W + H_GAP)),
  );
  let height = PAD * 2 + EL_SIZE + V_GAP / 2 + maxLevel * (CARD_H + V_GAP);
  for (const p of nodePos.values()) {
    width = Math.max(width, p.x + CARD_W + PAD);
    height = Math.max(height, p.y + CARD_H + PAD);
  }
  return { elPos, nodePos, width, height };
}

export function LineageCanvas({
  nodes, elements, selectedIds, onToggleNode, layoutOverrides = {}, onMoveNode,
}: {
  nodes: BlendNode[];
  elements: Element[];
  selectedIds: string[];
  onToggleNode: (id: string) => void;
  /** tree.canvasLayout：手动拖拽过的节点位置 */
  layoutOverrides?: Record<string, Pos>;
  onMoveNode?: (id: string, pos: Pos) => void;
}) {
  // 拖拽中的实时偏移（松手后经 onMoveNode 持久化到 canvasLayout）
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragRef = useRef<{ id: string; base: Pos } | null>(null);

  const { elPos, nodePos, width, height } = useMemo(
    () => layout(nodes, elements, layoutOverrides),
    [nodes, elements, layoutOverrides],
  );
  const nodePosRef = useRef(nodePos);
  nodePosRef.current = nodePos;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 位移超阈值才接管手势，普通点按仍由 Pressable 处理
        onMoveShouldSetPanResponder: (_e, g) =>
          !!onMoveNode && !!dragRef.current && Math.hypot(g.dx, g.dy) > 6,
        onPanResponderMove: (_e, g) => {
          const d = dragRef.current;
          if (d) setDrag({ id: d.id, dx: g.dx, dy: g.dy });
        },
        onPanResponderRelease: (_e, g) => {
          const d = dragRef.current;
          if (d && onMoveNode && Math.hypot(g.dx, g.dy) > 6) {
            onMoveNode(d.id, { x: Math.max(0, d.base.x + g.dx), y: Math.max(0, d.base.y + g.dy) });
          }
          dragRef.current = null;
          setDrag(null);
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          setDrag(null);
        },
      }),
    [onMoveNode],
  );
  const reader = useMemo(() => ({ getNode: (id: string) => nodes.find((n) => n.id === id) }), [nodes]);

  const edges: Array<{ from: Pos; to: Pos; key: string; hot: boolean }> = [];
  for (const n of nodes) {
    const to = nodePos.get(n.id)!;
    for (const pid of n.recipe.parentNodeIds) {
      const from = nodePos.get(pid);
      if (from) edges.push({
        key: pid + ">" + n.id,
        hot: selectedIds.includes(n.id),
        from: { x: from.x + CARD_W / 2, y: from.y + CARD_H },
        to: { x: to.x + CARD_W / 2, y: to.y },
      });
    }
    for (const eid of n.recipe.elementIds) {
      const from = elPos.get(eid);
      if (from) edges.push({
        key: eid + ">" + n.id,
        hot: selectedIds.includes(n.id),
        from: { x: from.x + EL_SIZE / 2, y: from.y + EL_SIZE },
        to: { x: to.x + CARD_W / 2, y: to.y },
      });
    }
  }

  return (
    <ScrollView horizontal style={{ maxHeight: Math.min(height, 460) }}>
      <ScrollView>
        <View style={{ width, height }}>
          <Svg width={width} height={height} style={{ position: "absolute" }}>
            {edges.map((e) => (
              <Path
                key={e.key}
                d={`M ${e.from.x} ${e.from.y} C ${e.from.x} ${e.from.y + 34}, ${e.to.x} ${e.to.y - 34}, ${e.to.x} ${e.to.y}`}
                fill="none"
                stroke={e.hot ? theme.ember : theme.borderStrong}
                strokeWidth={e.hot ? 1.8 : 1.2}
                strokeOpacity={e.hot ? 0.9 : 0.7}
              />
            ))}
          </Svg>

          {elements.map((el) => {
            const p = elPos.get(el.id)!;
            return (
              <View key={el.id} style={{ position: "absolute", left: p.x, top: p.y }}>
                <HashImage hash={el.imageHash} size={EL_SIZE} round />
              </View>
            );
          })}

          {nodes.map((n, i) => {
            const base = nodePos.get(n.id)!;
            const p = drag?.id === n.id
              ? { x: Math.max(0, base.x + drag.dx), y: Math.max(0, base.y + drag.dy) }
              : base;
            const selected = selectedIds.includes(n.id);
            const stale = isNodeStale(n, reader);
            const canonical = n.outputs.find((o) => o.id === n.canonicalOutputId);
            const op = OPERATORS.find((o) => o.id === n.recipe.operator);
            return (
              <Pressable
                key={n.id}
                onPress={() => onToggleNode(n.id)}
                onPressIn={() => { dragRef.current = { id: n.id, base }; }}
                {...panResponder.panHandlers}
                style={{
                  position: "absolute", left: p.x, top: p.y, width: CARD_W,
                  zIndex: drag?.id === n.id ? 10 : undefined,
                  backgroundColor: selected ? theme.cardRaised : theme.card,
                  borderRadius: 8, padding: 6,
                  borderWidth: 1,
                  borderColor: selected ? theme.ember : stale ? theme.steelDim : theme.border,
                  borderStyle: stale ? "dashed" : "solid",
                  opacity: stale ? 0.75 : 1,
                }}
              >
                {canonical
                  ? <HashImage hash={canonical.imageHash} size={CARD_W - 12} />
                  : <View style={{ width: CARD_W - 12, height: CARD_W - 12 }} />}
                <Text style={{ ...display(12), marginTop: 5 }}>
                  v{i + 1} · {op?.symbol} {op?.nameZh}
                </Text>
                <Text style={{ ...kicker(stale ? theme.steel : theme.textFaint), fontSize: 8.5, marginTop: 2 }}>
                  {stale ? "Stale · 过时" : `${n.outputs.length} takes${n.recipe.mode === "recast" ? " · recast" : ""}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
