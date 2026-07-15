import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import type { Output } from "@blend/core";
import { blobUrl } from "@/blobs";
import { display, kicker, theme } from "@/theme";

export function OutputLightbox({
  outputs, initialOutputId, canonicalOutputId, onClose, onCanonize, onDownload,
}: {
  outputs: Output[];
  initialOutputId: string;
  canonicalOutputId: string | null;
  onClose: () => void;
  onCanonize: (outputId: string) => void;
  onDownload: (output: Output) => void;
}) {
  const initialIndex = Math.max(0, outputs.findIndex((o) => o.id === initialOutputId));
  const [index, setIndex] = useState(initialIndex);
  const [url, setUrl] = useState<string | null>(null);
  const output = outputs[index];
  const hasMany = outputs.length > 1;

  useEffect(() => {
    if (!output) return;
    let live = true;
    void blobUrl(output.imageHash).then((next) => live && setUrl(next));
    return () => { live = false; };
  }, [output]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + outputs.length) % outputs.length);
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % outputs.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, outputs.length]);

  const label = useMemo(() => output?.conceptName ?? `候选 ${index + 1}`, [index, output]);
  if (!output) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.96)", alignItems: "center", justifyContent: "center", padding: 34 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭预览" onPress={onClose}
          style={{ position: "absolute", right: 28, top: 24, zIndex: 3, width: 44, height: 44, borderWidth: 1, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.text, fontSize: 23 }}>×</Text>
        </Pressable>

        <View style={{ width: "100%", height: "82%", maxWidth: 1120, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 }}>
          {hasMany && <Pressable onPress={() => setIndex((i) => (i - 1 + outputs.length) % outputs.length)} style={navBtn}>
            <Text style={{ color: theme.text, fontSize: 28 }}>‹</Text>
          </Pressable>}
          <View style={{ flex: 1, height: "100%", overflow: "hidden", backgroundColor: theme.card, borderWidth: 1, borderColor: theme.borderStrong }}>
            {url && <Image source={{ uri: url }} resizeMode="contain" style={{ width: "100%", height: "100%" }} />}
          </View>
          {hasMany && <Pressable onPress={() => setIndex((i) => (i + 1) % outputs.length)} style={navBtn}>
            <Text style={{ color: theme.text, fontSize: 28 }}>›</Text>
          </Pressable>}
        </View>

        <View style={{ marginTop: 18, alignItems: "center", gap: 8 }}>
          <Text style={kicker(theme.spore)}>{index + 1} / {outputs.length} · Candidate specimen</Text>
          <Text style={display(24)}>{label}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable onPress={() => onDownload(output)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: theme.borderStrong }}>
              <Text style={{ color: theme.textDim, fontWeight: "700" }}>↓ 下载原图</Text>
            </Pressable>
            <Pressable
              onPress={() => onCanonize(output.id)}
              style={{ paddingHorizontal: 22, paddingVertical: 10, backgroundColor: output.id === canonicalOutputId ? theme.sporeDim : theme.ember }}
            >
              <Text style={{ color: output.id === canonicalOutputId ? theme.spore : "#050505", fontWeight: "800" }}>
                {output.id === canonicalOutputId ? "★ 已是本代产物" : "选为本代产物"}
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: theme.textFaint, fontSize: 11 }}>← → 切换 · Esc 关闭</Text>
        </View>
      </View>
    </Modal>
  );
}

const navBtn = {
  width: 48, height: 72, borderWidth: 1, borderColor: theme.borderStrong,
  alignItems: "center", justifyContent: "center", backgroundColor: theme.panel,
} as const;
