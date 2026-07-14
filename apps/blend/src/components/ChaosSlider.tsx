import { useRef } from "react";
import { PanResponder, Text, View } from "react-native";
import { theme } from "@/theme";

/** 守序 ⇄ 混沌滑轨：驱动 director 创意档位与采样温度，默认居中。 */

const TRACK_W = 220;
const THUMB = 18;

function bandLabel(v: number): string {
  if (v < 0.34) return "守序 · 忠实原图，干净利落";
  if (v < 0.67) return "平衡 · 一个清晰创意点";
  return "混沌 · 允许尺度反转与诗意重解";
}

export function ChaosSlider({ value, onChange }: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  // 点按跳到该位置，随后以按下点为基准跟随拖动
  const grantValue = useRef(value);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const v = clamp((e.nativeEvent.locationX - THUMB / 2) / (TRACK_W - THUMB));
        grantValue.current = v;
        onChange(v);
      },
      onPanResponderMove: (_e, g) => {
        onChange(clamp(grantValue.current + g.dx / (TRACK_W - THUMB)));
      },
    }),
  ).current;

  const x = value * (TRACK_W - THUMB);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: TRACK_W }}>
        <Text style={{ color: theme.textDim, fontSize: 11 }}>⚖️ 守序</Text>
        <Text style={{ color: theme.textDim, fontSize: 11 }}>混沌 🌀</Text>
      </View>
      <View
        {...pan.panHandlers}
        style={{
          width: TRACK_W, height: 26, justifyContent: "center",
        }}
      >
        <View style={{
          height: 3, borderRadius: 2, backgroundColor: theme.border,
        }} />
        <View style={{
          position: "absolute", left: 0, width: x + THUMB / 2, height: 3,
          borderRadius: 2, backgroundColor: theme.ember, top: 11.5,
        }} />
        <View style={{
          position: "absolute", left: x, top: 4,
          width: THUMB, height: THUMB, borderRadius: THUMB / 2,
          backgroundColor: theme.emberBright, borderWidth: 2, borderColor: "#170f07",
        }} />
      </View>
      <Text style={{ color: theme.textFaint, fontSize: 11 }}>{bandLabel(value)}</Text>
    </View>
  );
}
