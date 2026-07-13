import { Platform, type TextStyle } from "react-native";

/**
 * 视觉基调：概念艺术画册 × 铸造工坊图鉴。
 * 暖黑纸面上的熔金与冷钢——大面积近黑留白，唯一强调色是炉口的一点熔金；
 * 衬线展示字体 + 小型大写 kicker，像美术设定集里的标本注记。
 */
export const theme = {
  // 纸面层次（暖黑，由深到浅）
  bg: "#0f0d0b",
  panel: "#16130f",
  card: "#1d1915",
  cardRaised: "#242019",
  // 发丝线
  border: "rgba(237,230,218,0.09)",
  borderStrong: "rgba(237,230,218,0.18)",
  // 墨色
  text: "#ede6da",
  textDim: "#93887a",
  textFaint: "#5f574c",
  // 熔金（唯一暖强调）
  ember: "#e08e45",
  emberBright: "#f2a95c",
  emberDim: "#6e4522",
  emberGlow: "rgba(224,142,69,0.16)",
  // 冷钢（次强调：元数据、stale、辅助信息）
  steel: "#7d8b96",
  steelDim: "rgba(125,139,150,0.35)",
  danger: "#c96a5b",
  ok: "#8fae7a",
} as const;

const serif = Platform.select({
  web: "Georgia, 'Songti SC', 'Noto Serif SC', serif",
  default: "Georgia",
});

/** 展示衬线（标题/版本号/操作符符号） */
export const display = (size: number, color: string = theme.text): TextStyle => ({
  fontFamily: serif,
  fontSize: size,
  color,
  letterSpacing: 0.3,
});

/** kicker：小型大写注记（面板题头、标签） */
export const kicker = (color: string = theme.textDim): TextStyle => ({
  fontSize: 10,
  color,
  letterSpacing: 2.2,
  textTransform: "uppercase",
  fontWeight: "600",
});
