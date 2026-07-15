import { useMemo, useRef, useState } from "react";
import { PanResponder, ScrollView, Text, View } from "react-native";
import type { ReactNode } from "react";
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

/**
 * 可拖拽节点卡：自带手势（位移 ≤6px 算点选，>6px 算拖动）。
 * 之前把 PanResponder 挂在 Pressable 上，web 端 move 事件被 Pressable
 * 吞掉导致拖拽完全不生效——改为 View + 自判 tap/drag。
 */
function NodeCard({ onTap, onDrag, onDrop, style, children }: {
  onTap: () => void;
  onDrag: (dx: number, dy: number) => void;
  onDrop: (dx: number, dy: number) => void;
  style: object;
  children: ReactNode;
}) {
  const refs = useRef({ onTap, onDrag, onDrop, dragging: false });
  refs.current.onTap = onTap;
  refs.current.onDrag = onDrag;
  refs.current.onDrop = onDrop;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        if (!refs.current.dragging && Math.hypot(g.dx, g.dy) > 6) refs.current.dragging = true;
        if (refs.current.dragging) refs.current.onDrag(g.dx, g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (refs.current.dragging) refs.current.onDrop(g.dx, g.dy);
        else refs.current.onTap();
        refs.current.dragging = false;
      },
      onPanResponderTerminate: (_e, g) => {
        if (refs.current.dragging) refs.current.onDrop(g.dx, g.dy);
        refs.current.dragging = false;
      },
    }),
  ).current;

  return (
    <View {...pan.panHandlers} style={style}>
      {children}
    </View>
  );
}

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
  nodes, elements, focusedNodeId, activeParentIds, onFocusNode, layoutOverrides = {}, onMoveNode, viewportHeight,
}: {
  nodes: BlendNode[];
  elements: Element[];
  focusedNodeId: string | null;
  activeParentIds: string[];
  onFocusNode: (id: string) => void;
  /** tree.canvasLayout：手动拖拽过的节点位置 */
  layoutOverrides?: Record<string, Pos>;
  onMoveNode?: (id: string, pos: Pos) => void;
  /** 画布视口高度（宽屏分栏时由外部撑满右栏） */
  viewportHeight?: number;
}) {
  // 拖拽中的实时偏移（松手后经 onMoveNode 持久化到 canvasLayout）
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const { elPos, nodePos, width, height } = useMemo(
    () => layout(nodes, elements, layoutOverrides),
    [nodes, elements, layoutOverrides],
  );
  const reader = useMemo(() => ({ getNode: (id: string) => nodes.find((n) => n.id === id) }), [nodes]);

  // 拖拽中的节点：连线实时跟随
  const posOf = (id: string): Pos | undefined => {
    const base = nodePos.get(id);
    if (!base) return undefined;
    return drag?.id === id
      ? { x: Math.max(0, base.x + drag.dx), y: Math.max(0, base.y + drag.dy) }
      : base;
  };

  const edges: Array<{ from: Pos; to: Pos; key: string; hot: boolean }> = [];
  for (const n of nodes) {
    const to = posOf(n.id)!;
    for (const pid of n.recipe.parentNodeIds) {
      const from = posOf(pid);
      if (from) edges.push({
        key: pid + ">" + n.id,
        hot: activeParentIds.includes(n.id),
        from: { x: from.x + CARD_W / 2, y: from.y + CARD_H },
        to: { x: to.x + CARD_W / 2, y: to.y },
      });
    }
    for (const eid of n.recipe.elementIds) {
      const from = elPos.get(eid);
      if (from) edges.push({
        key: eid + ">" + n.id,
        hot: activeParentIds.includes(n.id),
        from: { x: from.x + EL_SIZE / 2, y: from.y + EL_SIZE },
        to: { x: to.x + CARD_W / 2, y: to.y },
      });
    }
  }

  return (
    <ScrollView
      horizontal
      style={viewportHeight ? { height: viewportHeight } : { maxHeight: Math.min(height, 460) }}
    >
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
            const p = posOf(n.id)!;
            const focused = focusedNodeId === n.id;
            const active = activeParentIds.includes(n.id);
            const stale = isNodeStale(n, reader);
            const canonical = n.outputs.find((o) => o.id === n.canonicalOutputId);
            const op = OPERATORS.find((o) => o.id === n.recipe.operator);
            return (
              <NodeCard
                key={n.id}
                onTap={() => onFocusNode(n.id)}
                onDrag={(dx, dy) => setDrag({ id: n.id, dx, dy })}
                onDrop={(dx, dy) => {
                  setDrag(null);
                  onMoveNode?.(n.id, { x: Math.max(0, base.x + dx), y: Math.max(0, base.y + dy) });
                }}
                style={{
                  position: "absolute", left: p.x, top: p.y, width: CARD_W,
                  zIndex: drag?.id === n.id ? 10 : undefined,
                  backgroundColor: focused ? theme.cardRaised : theme.card,
                  padding: 6, borderWidth: active ? 2 : 1,
                  borderColor: active ? theme.spore : focused ? theme.ember : stale ? theme.steelDim : theme.border,
                  borderStyle: stale ? "dashed" : "solid",
                  opacity: stale ? 0.75 : 1,
                  cursor: "grab",
                  boxShadow: active ? `0 0 0 1px ${theme.sporeDim}` : focused ? `0 0 0 1px ${theme.emberGlow}` : undefined,
                } as object}
              >
                {canonical
                  ? <HashImage hash={canonical.imageHash} size={CARD_W - 12} />
                  : <View style={{ width: CARD_W - 12, height: CARD_W - 12 }} />}
                <Text style={{ ...display(12), marginTop: 5, color: active ? theme.spore : theme.text }}>
                  v{i + 1} · {op?.symbol} {op?.nameZh}
                </Text>
                <Text style={{ ...kicker(stale ? theme.steel : theme.textFaint), fontSize: 8.5, marginTop: 2 }}>
                  {stale ? "Stale · 过时" : `${n.outputs.length} takes${n.recipe.mode === "recast" ? " · recast" : ""}`}
                </Text>
              </NodeCard>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
