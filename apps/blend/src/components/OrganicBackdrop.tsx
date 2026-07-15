import { useEffect } from "react";
import { Platform, View } from "react-native";

/** 无图片的灰阶像素场：网点通过 steps() 轻微跳动，保持低带宽。 */
export function OrganicBackdrop() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("blend-pixel-motion")) return;
    const style = document.createElement("style");
    style.id = "blend-pixel-motion";
    style.textContent = `
      @keyframes blend-pixel-drift { 0% { transform: translate3d(0,0,0) } 50% { transform: translate3d(-28px,18px,0) } 100% { transform: translate3d(0,0,0) } }
      @keyframes blend-pixel-pulse { 0%,100% { opacity:.18 } 50% { opacity:.34 } }
      @media (prefers-reduced-motion: reduce) { .blend-pixel { animation:none!important } }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <View style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" } as object}>
      <View style={{
        position: "absolute", width: 620, height: 620, right: -250, top: -250, opacity: 0.28,
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,.72) 0 2px, transparent 2.4px)",
        backgroundSize: "10px 10px",
        maskImage: "radial-gradient(circle at 48% 48%, black 0 42%, transparent 70%)",
        animation: "blend-pixel-drift 14s steps(14,end) infinite",
      } as object} />
      <View style={{
        position: "absolute", width: 440, height: 520, left: -210, bottom: -250, opacity: 0.2,
        backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.55) 0 3px, transparent 3px 9px), repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 2px, transparent 2px 12px)",
        maskImage: "radial-gradient(ellipse at center, black 0 34%, transparent 72%)",
        animation: "blend-pixel-pulse 9s steps(9,end) infinite",
      } as object} />
      <View style={{
        position: "absolute", inset: 0, opacity: 0.12,
        backgroundImage: "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px)",
        backgroundSize: "100% 6px",
        maskImage: "linear-gradient(to bottom, black, transparent 72%)",
      } as object} />
    </View>
  );
}
