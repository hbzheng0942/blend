import { useEffect } from "react";
import { Platform } from "react-native";

const fontAsset = Platform.OS === "web"
  ? require("../../assets/fonts/fusion-pixel-10px-zh_hans.woff2")
  : null;

function assetUrl(asset: unknown): string {
  if (typeof asset === "string") return asset;
  if (asset && typeof asset === "object") {
    const value = asset as { default?: string; uri?: string };
    return value.default ?? value.uri ?? "";
  }
  return "";
}

/** 在 Web 端加载本地 OFL 像素字体并建立全局像素渲染规则。 */
export function PixelSystem() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("blend-pixel-system")) return;
    const url = assetUrl(fontAsset);
    const style = document.createElement("style");
    style.id = "blend-pixel-system";
    style.textContent = `
      @font-face {
        font-family: "Blend Fusion Pixel";
        src: url("${url}") format("woff2");
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }
      html, body, #root, #root * {
        font-family: "Blend Fusion Pixel", "SFMono-Regular", Menlo, monospace !important;
        -webkit-font-smoothing: none;
        font-smooth: never;
      }
      html, body, #root {
        width:100%; min-height:100%; height:auto!important; margin:0; background:#050505;
        overflow-x:hidden; overflow-y:auto!important; position:static!important;
      }
      #root { min-height:100vh; }
      ::selection { background:#f4f4f1; color:#000; }
      button, [role="button"] { cursor: pointer; }
      img { image-rendering: auto; }
      [data-pixel-art="true"] { image-rendering: pixelated; }
      @keyframes blend-marquee { from { transform:translateX(0) } to { transform:translateX(-50%) } }
      @keyframes blend-orbit { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      @keyframes blend-orbit-reverse { from { transform:rotate(360deg) } to { transform:rotate(0deg) } }
      @keyframes blend-dormant { 0%,100% { opacity:.35; transform:scale(.9) } 50% { opacity:1; transform:scale(1.15) } }
      @keyframes blend-nucleus-pulse { 0%,100% { box-shadow:0 0 0 rgba(255,255,255,0) } 50% { box-shadow:0 0 24px rgba(255,255,255,.18) } }
      @keyframes blend-galaxy-orbit { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      @keyframes blend-embryo-pulse { 0%,100% { opacity:.72;transform:scale(.92) } 50% { opacity:1;transform:scale(1.08) } }
      @keyframes blend-field-shift { 0%,100% { background-position:0 0 } 50% { background-position:12px 8px } }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior:auto!important; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return null;
}
