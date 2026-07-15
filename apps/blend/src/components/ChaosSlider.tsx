import { Pressable, Text, View } from "react-native";
import { theme } from "@/theme";

/** 三档语义距离。连续滑杆会制造模型并不存在的假精度。 */

const LEVELS = [
  { value: 0.15, title: "守序", caption: "形态" },
  { value: 0.5, title: "跃迁", caption: "功能" },
  { value: 0.85, title: "混沌", caption: "意义" },
] as const;

function bandLabel(v: number): string {
  if (v < 0.34) return "守序 · 融合形态与结构";
  if (v < 0.67) return "跃迁 · 融合行为与功能";
  return "混沌 · 融合意义与世界规则";
}

export function ChaosSlider({ value, onChange }: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", width: 270, borderWidth: 1, borderColor: theme.border }}>
        {LEVELS.map((level) => {
          const active = Math.abs(value - level.value) < 0.18;
          return (
            <Pressable
              key={level.title}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(level.value)}
              style={{
                width: 90,
                paddingVertical: 9,
                alignItems: "center",
                gap: 2,
                borderRightWidth: level.value === 0.85 ? 0 : 1,
                borderRightColor: theme.border,
                backgroundColor: active ? theme.text : "transparent",
              }}
            >
              <Text style={{ color: active ? theme.bg : theme.textDim, fontSize: 12 }}>{level.title}</Text>
              <Text style={{ color: active ? theme.bg : theme.textFaint, fontSize: 9 }}>{level.caption}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: theme.textFaint, fontSize: 11 }}>{bandLabel(value)}</Text>
    </View>
  );
}
