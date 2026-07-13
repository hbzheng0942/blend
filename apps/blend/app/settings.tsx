import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AgnesModelId } from "@blend/providers";
import { hasBuiltinChannel, useBlend } from "@/store";
import { display, kicker, theme } from "@/theme";

const MODELS: Array<{ id: AgnesModelId; label: string; desc: string }> = [
  {
    id: "agnes-image-2.1-flash",
    label: "agnes-image-2.1-flash",
    desc: "狂野熔炉 — 融合更彻底、质感更强（默认）",
  },
  {
    id: "agnes-image-2.0-flash",
    label: "agnes-image-2.0-flash",
    desc: "传统熔炉 — 更守规矩的保守拼贴风",
  },
];

export default function Settings() {
  const {
    apiKey, setApiKey, modelId, setModelId, providerChoice, setProviderChoice,
    geminiKey, setGeminiKey,
  } = useBlend();

  return (
    <View style={styles.page}>
      <View style={styles.section}>
        <Text style={kicker(theme.textFaint)}>Provider</Text>
        <Text style={styles.h}>生图引擎</Text>
        {([
          ["agnes", "Agnes", "默认 · 免费" + (hasBuiltinChannel() ? " · 内置通道开箱即用" : " · 需免费注册 key")],
          ["gemini", "Gemini (Nano Banana 2)", "BYOK · 多图理解上限 14 张 · 需自备 Google key"],
        ] as const).map(([id, label, desc]) => (
          <Pressable
            key={id}
            style={[styles.model, providerChoice === id && styles.modelActive]}
            onPress={() => setProviderChoice(id)}
          >
            <Text style={{ ...display(14), color: providerChoice === id ? theme.emberBright : theme.text }}>
              {label}
            </Text>
            <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 4 }}>{desc}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={kicker(theme.textFaint)}>Credentials</Text>
        <Text style={styles.h}>Agnes API Key{hasBuiltinChannel() ? "（可选）" : ""}</Text>
        <Text style={styles.p}>
          {hasBuiltinChannel()
            ? "默认走内置免费通道，无需配置。想直连 Agnes 官方（不与他人共享限额）可自填 key：" +
              "platform.agnes-ai.com → API Keys，免费注册、不绑卡，key 只存在你浏览器本地。"
            : "免费注册、不绑卡：platform.agnes-ai.com → API Keys。key 只存在你浏览器本地，" +
              "请求直连 Agnes，不经过任何第三方服务器。"}
        </Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="sk-..."
          placeholderTextColor={theme.textFaint}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={[styles.h, { marginTop: 12 }]}>Gemini API Key{providerChoice === "gemini" ? "" : "（选用 Gemini 引擎时必填）"}</Text>
        <Text style={styles.p}>
          aistudio.google.com → Get API key。同样只存本地、直连 Google，不经过任何第三方服务器。
        </Text>
        <TextInput
          style={styles.input}
          value={geminiKey}
          onChangeText={setGeminiKey}
          placeholder="AIza..."
          placeholderTextColor={theme.textFaint}
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <View style={styles.section}>
        <Text style={kicker(theme.textFaint)}>Furnace</Text>
        <Text style={styles.h}>熔炉型号（Agnes 引擎）</Text>
        {MODELS.map((m) => (
          <Pressable
            key={m.id}
            style={[styles.model, modelId === m.id && styles.modelActive]}
            onPress={() => setModelId(m.id)}
          >
            <Text style={{ ...display(14), color: modelId === m.id ? theme.emberBright : theme.text }}>
              {m.label}
            </Text>
            <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 4 }}>{m.desc}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  section: {
    backgroundColor: theme.panel, borderRadius: 12, padding: 18, gap: 8,
    borderWidth: 1, borderColor: theme.border,
  },
  h: { ...display(18) },
  p: { color: theme.textDim, fontSize: 13, lineHeight: 20 },
  input: {
    backgroundColor: theme.card, color: theme.text, borderRadius: 8,
    borderWidth: 1, borderColor: theme.border, padding: 12, marginTop: 4,
  },
  model: {
    backgroundColor: theme.card, borderRadius: 8, padding: 14, marginTop: 6,
    borderWidth: 1, borderColor: theme.border,
  },
  modelActive: { borderColor: theme.ember, backgroundColor: theme.emberGlow },
});
