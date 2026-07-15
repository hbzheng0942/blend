import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { display, kicker, theme } from "@/theme";
import { PixelGalaxyEmbryo } from "./PixelGalaxyEmbryo";

const DURATION = 6_900;
const SOL_PIXELS = [
  [0, -4], [-3, -3], [3, -3], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-4, 0], [-2, 0], [-1, 0],
  [0, 0], [1, 0], [2, 0], [4, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
  [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [-3, 3], [3, 3], [0, 4],
] as const;
const LUNA_PIXELS = [
  [-1, -4], [0, -4], [-3, -3], [-2, -3], [-1, -3], [0, -3], [-4, -2], [-3, -2],
  [-2, -2], [-1, -2], [-4, -1], [-3, -1], [-2, -1], [-4, 0], [-3, 0], [-2, 0],
  [-4, 1], [-3, 1], [-2, 1], [-4, 2], [-3, 2], [-2, 2], [-1, 2], [-3, 3],
  [-2, 3], [-1, 3], [0, 3], [-1, 4], [0, 4],
] as const;
function installGenesisCss() {
  if (typeof document === "undefined" || document.getElementById("blend-genesis-css")) return;
  const style = document.createElement("style");
  style.id = "blend-genesis-css";
  style.textContent = `
    @keyframes genesis-a { 0%{transform:translateX(-34vw) scale(.7);opacity:0} 12%,30%{transform:translateX(0) scale(1);opacity:1} 43%{transform:translateX(27vw) scale(.25);opacity:1} 46%,100%{transform:translateX(27vw) scale(0);opacity:0} }
    @keyframes genesis-b { 0%{transform:translateX(34vw) scale(.7) rotate(0);opacity:0} 12%,30%{transform:translateX(0) scale(1) rotate(0);opacity:1} 43%{transform:translateX(-27vw) scale(.25) rotate(90deg);opacity:1} 46%,100%{transform:translateX(-27vw) scale(0) rotate(90deg);opacity:0} }
    @keyframes genesis-equation { 0%,8%{opacity:0;transform:translateY(8px)} 14%,33%{opacity:1;transform:translateY(0)} 42%,100%{opacity:0;transform:translateY(-8px)} }
    @keyframes genesis-ripple { 0%,43%{opacity:0;transform:scale(.1)} 48%{opacity:1;transform:scale(.8)} 62%,100%{opacity:0;transform:scale(4.2)} }
    @keyframes genesis-flash { 0%,44%{opacity:0} 47%{opacity:1} 51%,100%{opacity:0} }
    @keyframes genesis-boom { 0%,44%{opacity:0;transform:scale(.2)} 48%,53%{opacity:1;transform:scale(1)} 59%,100%{opacity:0;transform:scale(2.6)} }
    @keyframes genesis-world { 0%,50%{opacity:0;transform:translate(-50%,-50%) scale(0) rotate(-28deg)} 58%{opacity:1;transform:translate(-50%,-50%) scale(1.5) rotate(8deg)} 68%,94%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)} 100%{opacity:0} }
    @keyframes genesis-caption { 0%,60%{opacity:0;transform:translateY(14px)} 72%,100%{opacity:1;transform:translateY(0)} }
    @keyframes genesis-grid { 0%,46%{opacity:0} 62%,100%{opacity:.22} }
    @keyframes genesis-exit { 0%,90%{opacity:1} 100%{opacity:0} }
    @keyframes genesis-scan { from{transform:translateY(-100%)} to{transform:translateY(100vh)} }
    @media (prefers-reduced-motion:reduce){[data-genesis-motion="true"]{animation-duration:.01ms!important;animation-delay:0ms!important}}
  `;
  document.head.appendChild(style);
}

function PixelCelestial({ kind }: { kind: "sol" | "luna" }) {
  const pixels = kind === "sol" ? SOL_PIXELS : LUNA_PIXELS;
  return (
    <View style={{ width: 126, height: 148, position: "relative", alignItems: "center" }}>
      <View style={{ position: "absolute", left: 18, top: 18, width: 90, height: 90, borderWidth: 1, borderColor: theme.textFaint, borderRadius: 999, opacity: .52, transform: [{ rotate: kind === "luna" ? "45deg" : "0deg" }] }} />
      {pixels.map(([x, y], index) => (
        <View key={index} style={{ position: "absolute", left: 59 + x * 10, top: 59 + y * 10, width: 8, height: 8, backgroundColor: (index + (kind === "luna" ? 1 : 0)) % 6 === 0 ? "#777773" : "#f4f4f1" }} />
      ))}
      <Text style={{ ...kicker(theme.textDim), position: "absolute", bottom: 0 }}>{kind === "sol" ? "SOL / LIGHT" : "LUNA / SHADOW"}</Text>
    </View>
  );
}

export function LandingGenesis({ force = false, onFinish }: { force?: boolean; onFinish: () => void }) {
  const [visible, setVisible] = useState(true);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setVisible(false);
      finishRef.current();
      return;
    }
    installGenesisCss();
    if (!force && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const timer = window.setTimeout(finish, DURATION);
    return () => window.clearTimeout(timer);
  }, [force]);

  function finish() {
    if (typeof window !== "undefined") window.sessionStorage.setItem("blend-genesis-seen", "1");
    setVisible(false);
    finishRef.current();
  }

  if (!visible) return null;
  return (
    <View data-genesis-motion="true" style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden", backgroundColor: "#000", animation: `genesis-exit ${DURATION}ms steps(16,end) both` } as object}>
      <View style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.72) 1px,transparent 1.4px)", backgroundSize: "8px 8px", maskImage: "radial-gradient(circle at 50% 54%,black,transparent 66%)", animation: `genesis-grid ${DURATION}ms steps(16,end) both` } as object} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: "#fff", opacity: .28, animation: "genesis-scan 2.2s steps(18,end) infinite" } as object} />
      <View style={{ position: "absolute", left: 24, top: 22 }}>
        <Text style={kicker(theme.textDim)}>BLEND / SOL × LUNA</Text>
        <Text style={{ ...display(10), color: theme.textFaint, marginTop: 5 }}>GENESIS COLLISION / EXPERIMENT #0001</Text>
      </View>
      <Pressable onPress={finish} style={{ position: "absolute", right: 24, top: 20, zIndex: 30, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: theme.borderStrong }}>
        <Text style={kicker(theme.textDim)}>SKIP →</Text>
      </Pressable>

      <View style={{ position: "absolute", inset: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: "19%" }}>
        <View style={{ animation: `genesis-a ${DURATION}ms steps(22,end) both` } as object}><PixelCelestial kind="sol" /></View>
        <View style={{ position: "absolute", left: "50%", top: "45%", width: 180, marginLeft: -90, alignItems: "center", animation: `genesis-equation ${DURATION}ms steps(12,end) both` } as object}>
          <Text style={{ ...display(24), color: theme.textDim }}>SOL ＋ LUNA</Text>
          <Text style={{ ...kicker(theme.textFaint), marginTop: 12 }}>COLLISION PRIMED</Text>
        </View>
        <View style={{ animation: `genesis-b ${DURATION}ms steps(22,end) both` } as object}><PixelCelestial kind="luna" /></View>
      </View>

      <View style={{ position: "absolute", left: "50%", top: "50%", width: 160, height: 160, marginLeft: -80, marginTop: -80, borderWidth: 2, borderColor: "#fff", borderRadius: 999, animation: `genesis-ripple ${DURATION}ms steps(12,end) both` } as object} />
      <View style={{ position: "absolute", inset: 0, backgroundColor: "#fff", pointerEvents: "none", animation: `genesis-flash ${DURATION}ms steps(8,end) both` } as object} />
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", pointerEvents: "none", animation: `genesis-boom ${DURATION}ms steps(10,end) both` } as object}>
        <Text style={{ ...display(82), letterSpacing: -5 }}>BOOM.</Text>
      </View>
      <View style={{ position: "absolute", left: "50%", top: "47%", animation: `genesis-world ${DURATION}ms steps(14,end) both` } as object}>
        <PixelGalaxyEmbryo size={280} />
      </View>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 58, alignItems: "center", animation: `genesis-caption ${DURATION}ms steps(12,end) both` } as object}>
        <Text style={display(25)}>于是，有了世界。</Text>
        <Text style={{ ...display(15), color: theme.textDim, marginTop: 9 }}>生命，也开始了第一次变异。</Text>
        <Text style={{ ...kicker(theme.textFaint), marginTop: 13 }}>A WORLD BEGINS TO MUTATE</Text>
      </View>
    </View>
  );
}
