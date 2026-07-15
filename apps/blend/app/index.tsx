import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { exportTreeToBlendFile, importBlendFile, pickBlendFile } from "@/blendfile";
import { importRecipeCode, importRecipePlan } from "@/recipecode";
import { SAMPLE_RECIPES } from "@/samples";
import { hasBuiltinChannel, useBlend } from "@/store";
import { display, kicker, theme } from "@/theme";
import { OrganicBackdrop } from "@/components/OrganicBackdrop";
import { LandingGenesis } from "@/components/LandingGenesis";
import { PixelGalaxyEmbryo } from "@/components/PixelGalaxyEmbryo";

const SEMANTIC_SPECIMENS = [
  {
    name: "鸣岁藤",
    image: "/samples/semantic-clock-bonsai.jpg",
    equation: "机械的急促 × 植物的缓慢",
    payoff: "每长一圈年轮，就敲响一次。",
  },
  {
    name: "风暴花",
    image: "/samples/semantic-dandelion-grenade.jpg",
    equation: "爆炸的触发 × 种子的繁衍",
    payoff: "它受到威胁时，会爆种。",
  },
  {
    name: "共鸣礁",
    image: "/samples/semantic-jellyfish-piano.jpg",
    equation: "漂浮的脉动 × 和弦的秩序",
    payoff: "洋流拨动它，潮汐开始演奏。",
  },
] as const;

const HERO_SOL = [[0,-3],[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1],[-3,0],[-2,0],[-1,0],[0,0],[1,0],[2,0],[3,0],[-2,1],[-1,1],[0,1],[1,1],[2,1],[-2,2],[-1,2],[0,2],[1,2],[2,2],[0,3]] as const;
const HERO_LUNA = [[-1,-3],[0,-3],[-2,-2],[-1,-2],[0,-2],[-3,-1],[-2,-1],[-1,-1],[-3,0],[-2,0],[-1,0],[-3,1],[-2,1],[-1,1],[-2,2],[-1,2],[0,2],[-1,3],[0,3]] as const;
function PrimalGlyph({ kind }: { kind: "sol" | "luna" }) {
  const pixels = kind === "sol" ? HERO_SOL : HERO_LUNA;
  return (
    <View style={styles.primalGlyph}>
      <View style={[styles.primalRing, kind === "luna" && { transform: [{ rotate: "45deg" }] }]} />
      {pixels.map(([x, y], index) => (
        <View key={index} style={{
          position: "absolute", left: "50%", top: "50%", width: 6, height: 6,
          marginLeft: x * 9 - 3, marginTop: y * 9 - 3,
          backgroundColor: index % (kind === "luna" ? 5 : 7) === 0 ? theme.textFaint : theme.text,
        }} />
      ))}
    </View>
  );
}

export default function TreeList() {
  const {
    trees, refreshTrees, createTree, deleteTree, loadTree, addElementFromBlob,
    apiKey, providerChoice, modelId, geminiKey,
    openaiKey, openaiModel,
  } = useBlend();
  const router = useRouter();
  const [importMsg, setImportMsg] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [startingSolLuna, setStartingSolLuna] = useState(false);
  const [introRun, setIntroRun] = useState(0);
  const [showIntro, setShowIntro] = useState(
    () => typeof window === "undefined" || window.sessionStorage.getItem("blend-genesis-seen") !== "1",
  );
  const furnaceName = providerChoice === "gemini" ? "Gemini" : providerChoice === "openai" ? openaiModel : modelId;
  const furnaceAccess = providerChoice === "gemini"
    ? geminiKey ? " · 自备 key" : " · ⚠ 未配置 key"
    : providerChoice === "openai"
      ? openaiKey ? " · 自备 key" : " · ⚠ 未配置 key"
      : apiKey
        ? " · 自备 key"
        : hasBuiltinChannel() ? " · 公共火种" : " · ⚠ 未配置 key";

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

  async function startSolLuna() {
    if (startingSolLuna) return;
    setStartingSolLuna(true);
    setImportMsg("");
    try {
      const tree = await createTree("SOL × LUNA · 创世实验");
      await loadTree(tree.id);
      for (const source of ["/samples/sun.jpg", "/samples/moon.jpg"]) {
        const response = await fetch(source);
        if (!response.ok) throw new Error("创世素材读取失败");
        await addElementFromBlob(await response.blob());
      }
      router.push(`/tree/${tree.id}`);
    } catch (error) {
      setImportMsg("⚠️ " + (error as Error).message);
      setStartingSolLuna(false);
    }
  }

  useEffect(() => {
    void refreshTrees();
  }, [refreshTrees]);

  return (
    <View style={styles.shell}>
      <Stack.Screen options={{ headerShown: false }} />
      {showIntro && <LandingGenesis key={introRun} force={introRun > 0} onFinish={() => setShowIntro(false)} />}
      <OrganicBackdrop />
      <View style={styles.homeNav}>
        <Text style={display(14)}>BLEND™</Text>
        <Text style={kicker(theme.textFaint)}>OPEN CONCEPT FOUNDRY / WEB.01</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page} showsVerticalScrollIndicator>
      {/* 图鉴扉页题头 */}
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <View style={styles.heroKickerRow}>
            <Text style={kicker(theme.spore)}>BLEND / CONCEPT FORGE</Text>
            <Pressable onPress={() => { setIntroRun((value) => value + 1); setShowIntro(true); }} style={styles.replayIntro}>
              <Text style={kicker(theme.textFaint)}>↻ REPLAY GENESIS</Text>
            </Pressable>
          </View>
          <Text style={styles.heroTitle}>把不相干的东西，{"\n"}炼成一个新物种。</Text>
          <Text style={styles.heroSub}>上传、粘贴、点火。每次出炉都是一场不可预测的小型进化。</Text>
        </View>
        <View style={styles.heroOrganism}>
          <View style={styles.sourceCell}>
            <PrimalGlyph kind="sol" />
            <Text style={styles.cellCaption}>SOL / LIGHT</Text>
          </View>
          <Text style={styles.equation}>＋</Text>
          <View style={styles.sourceCell}>
            <PrimalGlyph kind="luna" />
            <Text style={styles.cellCaption}>LUNA / SHADOW</Text>
          </View>
          <Text style={styles.equation}>→</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="用太阳和月亮素材开始锻造"
            disabled={startingSolLuna}
            onPress={() => void startSolLuna()}
            style={({ pressed }) => [
              styles.resultCell, resultCellMotion,
              pressed && { transform: [{ scale: 0.96 }] },
              startingSolLuna && { opacity: 0.55 },
            ]}
          >
            <PixelGalaxyEmbryo size={128} />
            <Text style={styles.resultCaption}>WORLD / GENESIS</Text>
            <Text style={styles.resultAction}>{startingSolLuna ? "GERMINATING…" : "REPLAY THIS CREATION ↗"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.protocolRail}>
        <View style={[styles.protocolTrack, protocolTrackMotion]}>
          <Text style={[styles.protocolText, noWrap]}>INPUT A + INPUT B → COLLIDE → MUTATE → SELECT → CONTINUE GROWING →&nbsp;&nbsp;&nbsp;</Text>
          <Text style={[styles.protocolText, noWrap]}>INPUT A + INPUT B → COLLIDE → MUTATE → SELECT → CONTINUE GROWING →&nbsp;&nbsp;&nbsp;</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          style={[styles.newBtn, { flex: 1 }]}
          onPress={async () => {
            const tree = await createTree("熔炉 " + new Date().toLocaleString());
            router.push(`/tree/${tree.id}`);
          }}
        >
          <Text style={styles.newBtnText}>点燃第一炉 ↗</Text>
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

      {/* 引擎状态退居次要层级，不阻断第一次点火。 */}
      <Link href="/settings" asChild>
        <Pressable style={styles.engineStrip}>
          <Text style={styles.engineText}>
            炉心 · {furnaceName}{furnaceAccess}
          </Text>
          <Text style={{ color: theme.textFaint, fontSize: 11 }}>调节炉心 →</Text>
        </Pressable>
      </Link>
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

      <View style={styles.specimenSection}>
        <View style={styles.specimenHeader}>
          <View style={{ gap: 6 }}>
            <Text style={kicker(theme.spore)}>CHAOS BENCHMARK / 异变标本</Text>
            <Text style={styles.specimenLead}>先说“什么鬼”，五秒后说“居然合理”。</Text>
          </View>
          <Text style={styles.specimenNote}>混沌不是贴皮。它让一种事物的行为，活进另一种事物的规则里。</Text>
        </View>
        <View style={styles.specimenGrid}>
          {SEMANTIC_SPECIMENS.map((specimen, index) => (
            <View key={specimen.name} style={[styles.specimenCard, index === 1 && styles.specimenCardShift]}>
              <View style={styles.specimenFrame}>
                <Image source={{ uri: specimen.image }} style={styles.specimenHeroImage} />
                <Text style={styles.specimenIndex}>0{index + 1}</Text>
                <Text style={styles.specimenStatus}>GOLD / LEAP</Text>
              </View>
              <Text style={styles.specimenName}>{specimen.name}</Text>
              <Text style={styles.specimenEquation}>◈ {specimen.equation}</Text>
              <Text style={styles.specimenPayoff}>{specimen.payoff}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 10, paddingVertical: 14 }}>
        {trees.length > 0 ? (
          <Text style={[kicker(theme.textFaint), { marginBottom: 4 }]}>我的谱系 · 仅存于本机浏览器</Text>
        ) : (
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
        )}
        {trees.map((item, index) => (
          <View key={item.id} style={styles.card}>
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
        ))}
      </View>

      <Link href="/settings" style={styles.settingsLink}>
        <Text style={[kicker(theme.textFaint)]}>Settings · 设置</Text>
      </Link>
      </ScrollView>
    </View>
  );
}

const protocolTrackMotion = { animation: "blend-marquee 22s linear infinite" } as object;
const resultCellMotion = { animation: "blend-nucleus-pulse 2.8s steps(7,end) infinite" } as object;
const noWrap = { whiteSpace: "nowrap" } as object;

const styles = StyleSheet.create({
  shell: { minHeight: "100vh", backgroundColor: theme.bg } as object,
  scroll: { flex: 1 },
  homeNav: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: "rgba(0,0,0,.88)" },
  page: { padding: 20, paddingBottom: 72, maxWidth: 1080, width: "100%", alignSelf: "center" },
  hero: {
    minHeight: 340, paddingVertical: 48, paddingHorizontal: 10, marginBottom: 4,
    borderBottomWidth: 1, borderColor: theme.border, flexDirection: "row", alignItems: "center", gap: 32,
  },
  heroTitle: { ...display(50), lineHeight: 65, marginTop: 14, letterSpacing: -1.2 },
  heroSub: { color: theme.textDim, fontSize: 13, marginTop: 8, lineHeight: 20 },
  heroKickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  replayIntro: { paddingVertical: 5, paddingHorizontal: 7, borderBottomWidth: 1, borderColor: theme.borderStrong },
  heroOrganism: { width: 470, height: 250, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  sourceCell: { width: 88, height: 112, alignItems: "center", justifyContent: "center" },
  cellCaption: { ...kicker(theme.textDim), fontSize: 8, letterSpacing: 1 },
  resultCell: { width: 150, height: 174, alignItems: "center", justifyContent: "center" },
  resultCaption: { ...kicker(theme.text), fontSize: 7, letterSpacing: 0.7 },
  resultAction: { ...kicker(theme.textFaint), fontSize: 6, letterSpacing: 0.6, marginTop: 5 },
  primalGlyph: { width: 78, height: 78, position: "relative", alignItems: "center", justifyContent: "center" },
  primalRing: { position: "absolute", inset: 8, borderWidth: 1, borderColor: theme.textFaint, borderRadius: 999 },
  equation: { color: theme.textFaint, fontSize: 18 },
  protocolRail: { height: 34, overflow: "hidden", borderBottomWidth: 1, borderColor: theme.border, justifyContent: "center", marginBottom: 2 },
  protocolTrack: { width: "200%", flexDirection: "row" },
  protocolText: { width: "50%", color: theme.textFaint, fontSize: 9, letterSpacing: 2.4 },
  specimenSection: {
    paddingTop: 34, paddingBottom: 38, borderBottomWidth: 1, borderColor: theme.border,
  },
  specimenHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22,
  },
  specimenLead: { ...display(24), lineHeight: 31 },
  specimenNote: { color: theme.textFaint, fontSize: 11, lineHeight: 18, maxWidth: 330, textAlign: "right" },
  specimenGrid: { flexDirection: "row", gap: 12, alignItems: "flex-start", minHeight: 390 },
  specimenCard: { flex: 1, minWidth: 0 },
  specimenCardShift: { marginTop: 28 },
  specimenFrame: {
    height: 270, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: "#000", overflow: "hidden",
  },
  specimenHeroImage: { width: "100%", height: "100%", objectFit: "cover" } as object,
  specimenIndex: {
    ...display(12, "#fff"), position: "absolute", left: 10, top: 8,
    backgroundColor: "rgba(0,0,0,.72)", paddingHorizontal: 6, paddingVertical: 3,
  },
  specimenStatus: {
    ...kicker("#fff"), position: "absolute", right: 10, bottom: 8, fontSize: 8,
    backgroundColor: "rgba(0,0,0,.72)", paddingHorizontal: 6, paddingVertical: 4,
  },
  specimenName: { ...display(19), marginTop: 10 },
  specimenEquation: { ...kicker(theme.textDim), fontSize: 9, marginTop: 6 },
  specimenPayoff: { color: theme.textFaint, fontSize: 11, marginTop: 7, lineHeight: 18 },
  banner: {
    backgroundColor: theme.emberGlow, padding: 12,
    marginTop: 14, borderWidth: 1, borderColor: theme.emberDim,
  },
  bannerText: { color: theme.emberBright, fontSize: 13 },
  newBtn: {
    backgroundColor: theme.ember, padding: 15, alignItems: "center",
    marginTop: 14,
  },
  newBtnText: { color: "#050505", fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  importBtn: {
    paddingHorizontal: 18, justifyContent: "center",
    borderWidth: 1, borderColor: theme.borderStrong, marginTop: 14,
  },
  codeInput: {
    flex: 1, backgroundColor: theme.panel, color: theme.text,
    borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13,
  },
  empty: { color: theme.textFaint, textAlign: "center", lineHeight: 22 },
  engineStrip: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: theme.panel, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.border, marginTop: 12, opacity: 0.78,
  },
  engineText: { color: theme.textDim, fontSize: 12, flex: 1, marginRight: 8 },
  entryHint: { color: theme.textFaint, fontSize: 11, lineHeight: 17, marginTop: 8 },
  sampleCard: {
    backgroundColor: theme.panel, padding: 16,
    borderWidth: 1, borderColor: theme.border, borderStyle: "dashed",
  },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: theme.panel, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  cardIndex: { ...display(13, theme.textFaint) },
  settingsLink: { alignSelf: "center", padding: 12 },
});
