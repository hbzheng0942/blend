import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import type { AgnesModelId } from "@blend/providers";
import { hasBuiltinChannel, useBlend } from "@/store";
import { OrganicBackdrop } from "@/components/OrganicBackdrop";
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
  const router = useRouter();
  const {
    apiKey, setApiKey, modelId, setModelId, providerChoice, setProviderChoice,
    geminiKey, setGeminiKey, openaiKey, setOpenAIKey,
    openaiBaseUrl, setOpenAIBaseUrl, openaiModel, setOpenAIModel,
  } = useBlend();

  return (
    <View style={styles.shell}>
      <Stack.Screen options={{ headerShown: false, title: "设置" }} />
      <OrganicBackdrop />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回首页" onPress={() => router.replace("/")} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View>
          <Text style={kicker(theme.textFaint)}>SYSTEM / 03</Text>
          <Text style={styles.topTitle}>炉心设置</Text>
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <View style={styles.section}>
        <Text style={kicker(theme.textFaint)}>Provider</Text>
        <Text style={styles.h}>生图引擎</Text>
        {([
          ["agnes", "Agnes", "默认 · 免费" + (hasBuiltinChannel() ? " · 内置通道开箱即用" : " · 需免费注册 key")],
          ["gemini", "Gemini (Nano Banana 2)", "BYOK · 多图理解上限 14 张 · 需自备 Google key"],
          ["openai", "OpenAI-compatible", "BYOK · GPT Image 2 / 其他兼容图片编辑服务"],
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
        <Text style={kicker(theme.textFaint)}>OpenAI-compatible / BYOK</Text>
        <Text style={styles.h}>自定义图片编辑通道</Text>
        <Text style={styles.p}>
          适配标准 multipart /v1/images/edits（image[]）。默认直连 OpenAI，也可换成实现相同协议的服务。
          Key 只存当前浏览器并直接发给你填写的地址；对方必须允许浏览器 CORS。
        </Text>
        <Text style={styles.fieldLabel}>API KEY</Text>
        <TextInput
          style={styles.input}
          value={openaiKey}
          onChangeText={setOpenAIKey}
          placeholder="sk-..."
          placeholderTextColor={theme.textFaint}
          secureTextEntry
          autoCapitalize="none"
        />
        <Text style={styles.fieldLabel}>BASE URL</Text>
        <TextInput
          style={styles.input}
          value={openaiBaseUrl}
          onChangeText={setOpenAIBaseUrl}
          placeholder="https://api.openai.com"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.fieldLabel}>IMAGE MODEL</Text>
        <TextInput
          style={styles.input}
          value={openaiModel}
          onChangeText={setOpenAIModel}
          placeholder="gpt-image-2"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.warning}>
          个人实验可直连；公开站点不要替用户托管第三方 Key。官方 OpenAI 若拦截浏览器 CORS，请填写你自己的兼容代理地址。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={kicker(theme.textFaint)}>Credentials</Text>
        <Text style={styles.h}>Agnes API Key{hasBuiltinChannel() ? "（可选）" : ""}</Text>
        <Text style={styles.p}>
          {hasBuiltinChannel()
            ? "默认走内置免费通道，无需配置即可开炉——但通道是所有人共用的，高峰期会排队。" +
              "强烈建议花 30 秒注册自己的免费 key（platform.agnes-ai.com → API Keys，不绑卡）：" +
              "独享限额、直连 Agnes、key 只存在你浏览器本地。"
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
      <Pressable onPress={() => router.replace("/")} style={styles.homeBtn}>
        <Text style={styles.homeBtnText}>保存于本机 · 返回首页 →</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.bg },
  topBar: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: "rgba(0,0,0,.88)" },
  backBtn: { width: 40, height: 40, borderWidth: 1, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center" },
  backText: { ...display(17) },
  topTitle: { ...display(16), marginTop: 2 },
  scroll: { flex: 1 },
  page: { padding: 20, paddingBottom: 64, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  section: {
    backgroundColor: "rgba(7,7,7,.92)", padding: 18, gap: 8,
    borderWidth: 1, borderColor: theme.border,
  },
  h: { ...display(18) },
  p: { color: theme.textDim, fontSize: 13, lineHeight: 20 },
  fieldLabel: { ...kicker(theme.textFaint), fontSize: 9, marginTop: 7 },
  warning: { color: theme.textFaint, fontSize: 11, lineHeight: 18, paddingTop: 4 },
  input: {
    backgroundColor: theme.card, color: theme.text,
    borderWidth: 1, borderColor: theme.border, padding: 12, marginTop: 4,
  },
  model: {
    backgroundColor: theme.card, padding: 14, marginTop: 6,
    borderWidth: 1, borderColor: theme.border,
  },
  modelActive: { borderColor: theme.ember, backgroundColor: theme.emberGlow },
  homeBtn: { minHeight: 52, backgroundColor: theme.ember, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  homeBtnText: { color: "#050505", fontSize: 13, fontWeight: "800" },
});
