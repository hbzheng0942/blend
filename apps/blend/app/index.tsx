import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { exportTreeToBlendFile, importBlendFile, pickBlendFile } from "@/blendfile";
import { importRecipeCode, importRecipePlan } from "@/recipecode";
import { SAMPLE_RECIPES } from "@/samples";
import { hasBuiltinChannel, useBlend } from "@/store";
import { display, kicker, theme } from "@/theme";

export default function TreeList() {
  const { trees, refreshTrees, createTree, deleteTree, apiKey, providerChoice, modelId, geminiKey } = useBlend();
  const router = useRouter();
  const [importMsg, setImportMsg] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");

  async function doImportCode() {
    try {
      const tree = await importRecipeCode(codeInput);
      setCodeInput("");
      setShowCodeInput(false);
      router.push(`/tree/${tree.id}`);
    } catch (e) {
      setImportMsg("⚠️ " + (e as Error).message);
    }
  }

  async function doImport() {
    const file = await pickBlendFile();
    if (!file) return;
    try {
      const tree = await importBlendFile(file);
      await refreshTrees();
      setImportMsg("已导入：" + tree.title);
    } catch (e) {
      setImportMsg("⚠️ " + (e as Error).message);
    }
  }

  useEffect(() => {
    void refreshTrees();
  }, [refreshTrees]);

  return (
    <View style={styles.page}>
      {/* 图鉴扉页题头 */}
      <View style={styles.hero}>
        <Text style={kicker(theme.textFaint)}>Concept Forge · Vol.001</Text>
        <Text style={[display(30), { marginTop: 6 }]}>熔炉谱系</Text>
        <Text style={styles.heroSub}>投入图像，熔炼新物种。每一炉都是一部血统志。</Text>
      </View>

      {/* 引擎状态条：型号 + key 来源一目了然，点击进设置 */}
      <Link href="/settings" asChild>
        <Pressable style={styles.engineStrip}>
          <Text style={styles.engineText}>
            ⚙︎ 引擎：{providerChoice === "gemini" ? "Gemini" : modelId}
            {providerChoice === "gemini"
              ? geminiKey ? " · 自备 key" : " · ⚠️ 未配置 key"
              : apiKey
                ? " · 自备 key 直连"
                : hasBuiltinChannel()
                  ? " · 共用免费通道（高峰会排队，建议 30 秒注册自己的免费 key）"
                  : " · ⚠️ 未配置 key"}
          </Text>
          <Text style={{ color: theme.textFaint, fontSize: 12 }}>设置 →</Text>
        </Pressable>
      </Link>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          style={[styles.newBtn, { flex: 1 }]}
          onPress={async () => {
            const tree = await createTree("熔炉 " + new Date().toLocaleString());
            router.push(`/tree/${tree.id}`);
          }}
        >
          <Text style={styles.newBtnText}>燃起新熔炉</Text>
        </Pressable>
        <Pressable style={styles.importBtn} onPress={() => void doImport()}>
          <Text style={{ color: theme.textDim, fontSize: 13 }}>导入 .blend</Text>
        </Pressable>
        <Pressable style={styles.importBtn} onPress={() => setShowCodeInput((v) => !v)}>
          <Text style={{ color: theme.textDim, fontSize: 13 }}>🧬 配方码</Text>
        </Pressable>
      </View>
      <Text style={styles.entryHint}>
        .blend = 完整谱系存档（含全部图片，备份/换设备用）· 配方码 = 只含配方不含图的短码，
        拿到别人的码后用你自己的图重走一遍，看会炼出什么不同的东西
      </Text>
      {showCodeInput && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TextInput
            style={styles.codeInput}
            value={codeInput}
            onChangeText={setCodeInput}
            placeholder="粘贴 BLEND1. 开头的配方码，用自己的图重演绎"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="none"
            onSubmitEditing={() => void doImportCode()}
          />
          <Pressable
            style={[styles.importBtn, { marginTop: 0 }, !codeInput.trim() && { opacity: 0.5 }]}
            disabled={!codeInput.trim()}
            onPress={() => void doImportCode()}
          >
            <Text style={{ color: theme.textDim, fontSize: 13 }}>重演绎</Text>
          </Pressable>
        </View>
      )}
      {!!importMsg && <Text style={{ color: theme.textDim, marginTop: 8 }}>{importMsg}</Text>}

      <FlatList
        data={trees}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ gap: 10, paddingVertical: 14 }}
        ListHeaderComponent={
          trees.length > 0 ? (
            <Text style={[kicker(theme.textFaint), { marginBottom: 4 }]}>
              我的谱系 · 仅存于本机浏览器
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ gap: 14, marginTop: 24 }}>
            <Text style={styles.empty}>
              这里是你的私人图鉴（所有数据只存在本机浏览器）。{"\n"}
              玩法：① 扔进 2 张以上的图 → ② 选一个融合操作符开炉抽卡 → ③ 选中意的入谱，
              继续往上叠图、分叉、合并，长成一棵血统树。
            </Text>
            <Text style={[kicker(theme.textFaint), { textAlign: "center" }]}>
              或者，从一份案例配方开始
            </Text>
            {SAMPLE_RECIPES.map((s) => (
              <Pressable
                key={s.title}
                style={styles.sampleCard}
                onPress={async () => {
                  const tree = await importRecipePlan(s.plan);
                  router.push(`/tree/${tree.id}`);
                }}
              >
                <Text style={[display(15)]}>{s.title}</Text>
                <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 4 }}>{s.desc}</Text>
                <Text style={{ color: theme.textFaint, fontSize: 11, marginTop: 6 }}>
                  点击开始 · 用你自己的图重演绎这条配方 →
                </Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <Text style={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</Text>
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/tree/${item.id}`)}>
              <Text style={[display(16)]}>{item.title}</Text>
              <Text style={[kicker(theme.textFaint), { marginTop: 5 }]}>
                {item.nodeIds.length} forgings · {item.rootElementIds.length} elements ·{" "}
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </Pressable>
            <Pressable onPress={() => void exportTreeToBlendFile(item.id)} hitSlop={8}>
              <Text style={{ color: theme.textFaint, fontSize: 16 }}>⤓</Text>
            </Pressable>
            <Pressable onPress={() => void deleteTree(item.id)} hitSlop={8}>
              <Text style={{ color: theme.textFaint, fontSize: 15 }}>✕</Text>
            </Pressable>
          </View>
        )}
      />

      <Link href="/settings" style={styles.settingsLink}>
        <Text style={[kicker(theme.textFaint)]}>Settings · 设置</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, maxWidth: 720, width: "100%", alignSelf: "center" },
  hero: {
    paddingVertical: 26, paddingHorizontal: 4, marginBottom: 4,
    borderBottomWidth: 1, borderColor: theme.border,
  },
  heroSub: { color: theme.textDim, fontSize: 13, marginTop: 8, lineHeight: 20 },
  banner: {
    backgroundColor: theme.emberGlow, borderRadius: 8, padding: 12,
    marginTop: 14, borderWidth: 1, borderColor: theme.emberDim,
  },
  bannerText: { color: theme.emberBright, fontSize: 13 },
  newBtn: {
    backgroundColor: theme.ember, borderRadius: 8, padding: 15, alignItems: "center",
    marginTop: 14,
  },
  newBtnText: { color: "#170f07", fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  importBtn: {
    borderRadius: 8, paddingHorizontal: 18, justifyContent: "center",
    borderWidth: 1, borderColor: theme.borderStrong, marginTop: 14,
  },
  codeInput: {
    flex: 1, backgroundColor: theme.panel, color: theme.text, borderRadius: 8,
    borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13,
  },
  empty: { color: theme.textFaint, textAlign: "center", lineHeight: 22 },
  engineStrip: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: theme.panel, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.border, marginTop: 12,
  },
  engineText: { color: theme.textDim, fontSize: 12, flex: 1, marginRight: 8 },
  entryHint: { color: theme.textFaint, fontSize: 11, lineHeight: 17, marginTop: 8 },
  sampleCard: {
    backgroundColor: theme.panel, borderRadius: 10, padding: 16,
    borderWidth: 1, borderColor: theme.border, borderStyle: "dashed",
  },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: theme.panel, borderRadius: 10, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  cardIndex: { ...display(13, theme.textFaint) },
  settingsLink: { alignSelf: "center", padding: 12 },
});
