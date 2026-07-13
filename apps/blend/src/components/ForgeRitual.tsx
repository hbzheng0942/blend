import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { display, kicker, theme } from "@/theme";

/** 锻造等待仪式：熔金脉动的操作符印记 + 轮换的炉语。撑住 50–90s 的常态生成延迟。 */

const FURNACE_LINES = [
  "炉温攀升，要素开始软化",
  "析出双方的形态骨架",
  "熔金渗入纹理缝隙",
  "锻锤落下，特征互相咬合",
  "回火中，稳固新的血统",
  "冷却成形，即将出炉",
];

export function ForgeRitual({ symbol, candidate, total }: {
  symbol: string;
  candidate: number;
  total: number;
}) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => setLineIdx((i) => (i + 1) % FURNACE_LINES.length), 9000);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [pulse]);

  return (
    <View style={{ alignItems: "center", paddingVertical: 10, gap: 10 }}>
      <Animated.View
        style={{
          opacity: pulse,
          width: 64, height: 64, borderRadius: 32,
          borderWidth: 1, borderColor: theme.ember,
          backgroundColor: theme.emberGlow,
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Text style={display(30, theme.emberBright)}>{symbol}</Text>
      </Animated.View>
      <Text style={{ color: theme.textDim, fontSize: 13 }}>{FURNACE_LINES[lineIdx]}</Text>
      <Text style={kicker(theme.textFaint)}>
        Take {candidate} / {total} · 约 1 分钟一张
      </Text>
    </View>
  );
}
