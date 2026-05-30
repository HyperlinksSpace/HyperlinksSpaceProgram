import { Platform } from "react-native";
import type { Router } from "expo-router";

type RouterBack = Pick<Router, "back" | "replace" | "canGoBack">;

function webHistoryIndex(): number | null {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

/** True when the browser tab has a prior history entry (expo-router `canGoBack` can lie on web). */
export function canAppNavigateBack(router: RouterBack): boolean {
  const idx = webHistoryIndex();
  if (idx != null) {
    return idx > 0;
  }
  return router.canGoBack();
}

/** Pop navigation history when possible; otherwise open authenticated home at `/`. */
export function navigateBackOrHome(router: RouterBack): void {
  if (canAppNavigateBack(router)) {
    router.back();
    return;
  }
  router.replace("/");
}
