import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "@/theme";
import { PixelSystem } from "@/components/PixelSystem";

export default function RootLayout() {
  return (
    <>
      <PixelSystem />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerShadowVisible: false,
          headerTintColor: theme.text,
          headerTitleStyle: {
            fontFamily: Platform.select({ web: "'Blend Fusion Pixel', monospace", default: "Courier" }),
            fontSize: 17,
            fontWeight: "500",
          },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Blend · 谱系图鉴" }} />
        <Stack.Screen name="tree/[id]" options={{ title: "锻造台" }} />
        <Stack.Screen name="settings" options={{ title: "设置" }} />
      </Stack>
    </>
  );
}
