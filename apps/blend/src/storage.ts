import { Platform } from "react-native";
import type { StorageAdapter } from "@blend/storage";
import { createIndexedDbAdapter, createMemoryAdapter } from "@blend/storage";

/** Phase 1 web-only：IndexedDB；iOS 的 sqlite 适配器 Phase 3 接入。 */
let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!adapter) {
    adapter = Platform.OS === "web" ? createIndexedDbAdapter() : createMemoryAdapter();
  }
  return adapter;
}
