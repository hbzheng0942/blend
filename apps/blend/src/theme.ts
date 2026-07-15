import { Platform, type TextStyle } from "react-native";

/** 灰阶像素实验室：黑色负空间、白色操作态、灰色信息层。 */
export const theme = {
  bg: "#000000",
  panel: "#070707",
  card: "#0d0d0d",
  cardRaised: "#171717",
  border: "rgba(255,255,255,0.10)",
  borderStrong: "rgba(255,255,255,0.28)",
  text: "#f4f4f1",
  textDim: "#a0a09b",
  textFaint: "#5c5c58",
  ember: "#f4f4f1",
  emberBright: "#ffffff",
  emberDim: "#666662",
  emberGlow: "rgba(255,255,255,0.09)",
  spore: "#d4d4cf",
  sporeDim: "rgba(212,212,207,0.16)",
  mycelium: "#8a8a85",
  plasma: "#bdbdb8",
  steel: "#80807b",
  steelDim: "rgba(128,128,123,0.34)",
  danger: "#d0d0cc",
  ok: "#c4c4bf",
} as const;

const mono = Platform.select({
  web: "'Blend Fusion Pixel', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
  default: "Courier",
});

export const display = (size: number, color: string = theme.text): TextStyle => ({
  fontFamily: mono,
  fontSize: size,
  color,
  letterSpacing: -0.2,
});

export const kicker = (color: string = theme.textDim): TextStyle => ({
  fontFamily: mono,
  fontSize: 10,
  color,
  letterSpacing: 1.7,
  textTransform: "uppercase",
  fontWeight: "500",
});
