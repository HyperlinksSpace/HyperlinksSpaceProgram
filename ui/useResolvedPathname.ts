import { usePathname } from "expo-router";
import { Platform } from "react-native";
import { useEffect, useState } from "react";

/**
 * Expo Router can briefly report null/empty pathname on web before the route hydrates.
 * Root layout used that to always show GlobalLogoBar — wrong on welcome-style layout at `/` (and legacy `/home` / `/welcome`) in TMA.
 * Sync read `window.location.pathname` when the router path is missing so the first paint
 * matches the real URL.
 */
export function useResolvedPathname(): string {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  if (pathname != null && pathname !== "") {
    return pathname;
  }
  if (hydrated && Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.pathname || "/";
  }
  return pathname ?? "/";
}
