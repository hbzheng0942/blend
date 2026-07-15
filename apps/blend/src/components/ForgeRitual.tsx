import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { display, kicker, theme } from "@/theme";
import type { DirectorIssue } from "@blend/providers";

/** 锻造等待仪式：熔金脉动的操作符印记 + 轮换的炉语。撑住 50–90s 的常态生成延迟。 */

const FURNACE_LINES = [
  "炉温攀升，要素开始软化",
  "析出双方的形态骨架",
  "熔金渗入纹理缝隙",
  "锻锤落下，特征互相咬合",
  "回火中，稳固新的血统",
  "冷却成形，即将出炉",
];

const DIRECTOR_ISSUE_LABEL: Record<DirectorIssue, string> = {
  timeout: "导演响应超时",
  "rate-limit": "公共导演正在排队",
  upstream: "导演上游暂不可用",
  network: "导演连接中断",
  "invalid-response": "导演方案未通过格式校验",
};

export function ForgeRitual({ symbol, done, total, conceptNames, directorMode, directorIssue, onAbort }: {
  symbol: string;
  /** 已出炉候选数（并行生成） */
  done: number;
  total: number;
  /** director 方案名：拿到即展示，等待有盼头 */
  conceptNames?: string[];
  directorMode?: "vlm" | "fallback";
  directorIssue?: DirectorIssue;
  onAbort?: () => void;
}) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  const nativeDriver = Platform.OS !== "web";
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver,
        }),
        Animated.timing(pulse, {
          toValue: 0.35, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver,
        }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => setLineIdx((i) => (i + 1) % FURNACE_LINES.length), 9000);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [nativeDriver, pulse]);

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
      {conceptNames?.length ? (
        <View style={{ alignItems: "center", gap: 5 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontStyle: "italic", textAlign: "center" }}>
            本炉在锻：{conceptNames.map((n) => `〔${n}〕`).join(" ")}
          </Text>
          {directorMode === "fallback" && (
            <Text style={kicker(theme.textFaint)}>
              {directorIssue ? DIRECTOR_ISSUE_LABEL[directorIssue] : "导演通道未连接"} · 已切单方案
            </Text>
          )}
        </View>
      ) : (
        <Text style={{ color: theme.textDim, fontSize: 13 }}>导演正在看图构思方案…</Text>
      )}
      <Text style={{ color: theme.textDim, fontSize: 13 }}>{FURNACE_LINES[lineIdx]}</Text>
      <Text style={kicker(theme.textFaint)}>
        已出炉 {done} / {total}{total > 1 ? " · 差异化并行熔炼" : " · 单方案熔炼"}
      </Text>
      {onAbort && (
        <Pressable onPress={onAbort} hitSlop={8}>
          <Text style={{ color: theme.textFaint, fontSize: 12, textDecorationLine: "underline" }}>
            熄火中止（已出炉的保留）
          </Text>
        </Pressable>
      )}
    </View>
  );
}
