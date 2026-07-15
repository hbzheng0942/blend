import { View } from "react-native";

const ARM_PIXELS = Array.from({ length: 36 }, (_, index) => {
  const angle = index * 0.32;
  const radius = 7 + index * 2.15;
  return [
    Math.round(Math.cos(angle) * radius),
    Math.round(Math.sin(angle) * radius * 0.72),
    index,
  ] as const;
}).flatMap(([x, y, index]) => [
  [x, y, index] as const,
  [-x, -y, index + 36] as const,
]);

const EMBRYO_PIXELS = [
  [0, -5], [-1, -4], [0, -4], [1, -4], [-2, -3], [-1, -3], [0, -3], [1, -3], [2, -3],
  [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [-2, -1], [-1, -1], [0, -1], [1, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2],
  [0, 3], [1, 3], [0, 4],
] as const;

/** Blend 的创世符号：远看是银河，近看是胚胎与谱系节点。 */
export function PixelGalaxyEmbryo({ size = 184 }: { size?: number }) {
  const scale = size / 184;
  const pixel = Math.max(3, Math.round(6 * scale));
  const center = size / 2;
  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <View style={{ position: "absolute", inset: size * 0.06, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", borderRadius: 999, transform: [{ rotate: "18deg" }] }} />
      <View style={{ position: "absolute", left: size * 0.18, right: size * 0.18, top: size * 0.31, bottom: size * 0.31, borderWidth: 1, borderColor: "rgba(255,255,255,.24)", borderRadius: 999, transform: [{ rotate: "-13deg" }] }} />

      <View style={{ position: "absolute", inset: 0, animation: "blend-galaxy-orbit 11s steps(64,end) infinite" } as object}>
        {ARM_PIXELS.map(([x, y, index]) => (
          <View
            key={`${x}:${y}:${index}`}
            style={{
              position: "absolute",
              left: center + x * scale - pixel / 2,
              top: center + y * scale - pixel / 2,
              width: index % 9 === 0 ? pixel + 2 : pixel,
              height: index % 9 === 0 ? pixel + 2 : pixel,
              backgroundColor: index % 7 === 0 ? "#6f6f6b" : index % 3 === 0 ? "#bdbdb8" : "#f4f4f1",
              opacity: 0.46 + (index % 5) * 0.12,
            }}
          />
        ))}
      </View>

      <View style={{ position: "absolute", inset: 0, animation: "blend-embryo-pulse 1.6s steps(8,end) infinite" } as object}>
        {EMBRYO_PIXELS.map(([x, y], index) => (
          <View
            key={`${x}:${y}:${index}`}
            style={{
              position: "absolute",
              left: center + x * 5.5 * scale - pixel / 2,
              top: center + y * 5.5 * scale - pixel / 2,
              width: pixel,
              height: pixel,
              backgroundColor: index % 8 === 0 ? "#777773" : "#fff",
            }}
          />
        ))}
      </View>

      {[
        [-0.39, -0.28, 7], [0.4, -0.2, 5], [0.34, 0.31, 8], [-0.33, 0.34, 5],
      ].map(([x, y, unit], index) => (
        <View key={index} style={{ position: "absolute", left: center + x * size, top: center + y * size, width: unit * scale, height: unit * scale, backgroundColor: index % 2 ? "#777773" : "#fff" }} />
      ))}
    </View>
  );
}
