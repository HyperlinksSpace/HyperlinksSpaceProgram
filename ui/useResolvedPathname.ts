import { usePathname } from "expo-router";
import { Platform } from "react-native";
import { useLayoutEffect, useState } from "react";

/**
 * Expo Router can briefly report null/empty pathname on web before the route hydrates.
 * Root layout used that to always show GlobalLogoBar — wrong on welcome-style layout at `/` (and legacy `/home` / `/welcome`) in TMA.
 * Sync read `window.location.pathname` when the router path is missing so the first paint
 * matches the real URL.
 *
 * **Critical (React #418):** `return pathname ?? "/"` is wrong for `""` — the empty string is
 * not nullish, so the client first paint could return `""` while SSR for the same frame used
 * `"/"`, which flips `GlobalLogoBar` / `FloatingShield` and style branches.
 */
export function useResolvedPathname(): string {
  const pathname = usePathname();
  const [clientAligned, setClientAligned] = useState(false);
  useLayoutEffect(() => {
    setClientAligned(true);
  }, []);
  if (pathname != null && pathname !== "") {
    return pathname;
  }
  if (clientAligned && Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.pathname || "/";
  }
  // Normalize empty/null the same for server + first client pass (treat as root).
  return "/";
}
