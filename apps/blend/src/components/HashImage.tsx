import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { blobUrl } from "@/blobs";
import { theme } from "@/theme";

/** hash → 图片（异步解析 blob object URL）。 */
export function HashImage({
  hash, size, selected, round,
}: { hash: string; size: number; selected?: boolean; round?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void blobUrl(hash).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [hash]);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: round ? size / 2 : 8, overflow: "hidden",
        backgroundColor: theme.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.ember : theme.border,
      }}
    >
      {url && <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} />}
    </View>
  );
}
