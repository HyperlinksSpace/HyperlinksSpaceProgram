/**
 * Initializes @tma.js/sdk and mounts viewport + hapticFeedback so GlobalLogoBar
 * can use safe area insets, isFullscreen, and haptics. Safe to use in browser
 * (init/mount are no-ops or skipped when not in Telegram).
 */
import { useEffect } from "react";
import { init, viewport } from "@tma.js/sdk-react";

export function TelegramSDKProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    try {
      init();
      viewport.mount?.();
    } catch {
      // Not in Telegram (e.g. browser) – components will use fallbacks
    }
  }, []);

  return <>{children}</>;
}
