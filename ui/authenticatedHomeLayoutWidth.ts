import { Platform, useWindowDimensions } from "react-native";

import { useAuthenticatedHomeSplitLayoutMetrics } from "./components/AuthenticatedHomeSplitLayoutMetricsContext";
import { computeTelegramLayoutStartupSnapshot } from "./components/telegramWebApp";
import { useTelegram } from "./components/Telegram";
import { layout } from "./theme";

/** Layout width for authenticated-home breakpoints (prefer visual viewport on web). */
export function readAuthenticatedHomeLayoutWidthPx(windowWidth: number): number {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const clientWidth = document.documentElement?.clientWidth ?? 0;
    if (clientWidth > 0) {
      return clientWidth;
    }
    if (typeof window !== "undefined" && window.innerWidth > 0) {
      return window.innerWidth;
    }
  }
  return windowWidth;
}

export function isAuthenticatedHomeWideLayoutWidthPx(widthPx: number): boolean {
  return widthPx > layout.authenticatedHome.firstBreakpoint;
}

export function isAuthenticatedHomeTripleColumnLayoutWidthPx(widthPx: number): boolean {
  return widthPx > layout.authenticatedHome.secondBreakpoint;
}

/** Wide vs compact for routes and chrome outside the split metrics provider. */
export function useAuthenticatedHomeRouteWideLayout(): boolean {
  const { width: windowWidth } = useWindowDimensions();
  return isAuthenticatedHomeWideLayoutWidthPx(readAuthenticatedHomeLayoutWidthPx(windowWidth));
}

/** Mobile TMA / narrow width: full-screen `/messages/chat` instead of home overlay/split. */
export function isAuthenticatedHomeCompactChatLayoutWidthPx(
  widthPx: number,
  options?: {
    platformEffective?: string | null;
    isMobileWebUserAgent?: boolean;
    isTelegramMiniAppDesktop?: boolean;
  },
): boolean {
  if (!isAuthenticatedHomeWideLayoutWidthPx(widthPx)) {
    return true;
  }
  if (options?.isTelegramMiniAppDesktop) {
    return false;
  }
  const platform = options?.platformEffective?.trim().toLowerCase();
  if (platform === "ios" || platform === "android") {
    return true;
  }
  return options?.isMobileWebUserAgent === true;
}

export function readAuthenticatedHomeCompactChatLayoutSync(): boolean {
  const widthPx = readAuthenticatedHomeLayoutWidthPx(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );
  const snap = computeTelegramLayoutStartupSnapshot();
  return isAuthenticatedHomeCompactChatLayoutWidthPx(widthPx, {
    platformEffective: snap.platformEffective,
    isMobileWebUserAgent: snap.isMobileWebUserAgent,
    isTelegramMiniAppDesktop: snap.isTelegramMiniAppDesktop,
  });
}

export function useAuthenticatedHomeCompactChatLayout(): boolean {
  const { width: windowWidth } = useWindowDimensions();
  const { layoutStartup } = useTelegram();
  const widthPx = readAuthenticatedHomeLayoutWidthPx(windowWidth);
  return isAuthenticatedHomeCompactChatLayoutWidthPx(widthPx, {
    platformEffective: layoutStartup.platformEffective,
    isMobileWebUserAgent: layoutStartup.isMobileWebUserAgent,
    isTelegramMiniAppDesktop: layoutStartup.isTelegramMiniAppDesktop,
  });
}

/** Prefer live split metrics when mounted under {@link AuthenticatedHomeSplitLayoutMetricsProvider}. */
export function useAuthenticatedHomeLayoutMode(): {
  layoutWidthPx: number;
  isWide: boolean;
  isTripleColumn: boolean;
  columnCount: 1 | 2 | 3;
} {
  const { width: windowWidth } = useWindowDimensions();
  const splitMetrics = useAuthenticatedHomeSplitLayoutMetrics();
  const fallbackWidthPx = readAuthenticatedHomeLayoutWidthPx(windowWidth);

  if (splitMetrics) {
    const layoutWidthPx = Math.min(splitMetrics.effectiveSplitWidthPx, fallbackWidthPx);
    const isWide = isAuthenticatedHomeWideLayoutWidthPx(layoutWidthPx);
    return {
      layoutWidthPx,
      isWide,
      isTripleColumn: isAuthenticatedHomeTripleColumnLayoutWidthPx(layoutWidthPx),
      columnCount: isWide
        ? isAuthenticatedHomeTripleColumnLayoutWidthPx(layoutWidthPx)
          ? 3
          : 2
        : 1,
    };
  }

  const layoutWidthPx = fallbackWidthPx;
  const isWide = isAuthenticatedHomeWideLayoutWidthPx(layoutWidthPx);
  return {
    layoutWidthPx,
    isWide,
    isTripleColumn: isAuthenticatedHomeTripleColumnLayoutWidthPx(layoutWidthPx),
    columnCount: isWide
      ? isAuthenticatedHomeTripleColumnLayoutWidthPx(layoutWidthPx)
        ? 3
        : 2
      : 1,
  };
}
