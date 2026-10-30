import { Platform } from "react-native";
import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { isWelcomeLayoutRoute } from "../isWelcomeLayoutRoute";
import { useResolvedPathname } from "../useResolvedPathname";
import { showGlobalLogoBarOnWelcomeTma } from "./telegramWebApp";
import { useTelegram } from "./Telegram";

/** Hairline under {@link GlobalLogoBar} — not included in `height: blockHeight`. */
export const GLOBAL_LOGO_BAR_BOTTOM_BORDER_PX = 1;

const LOGO_HEIGHT = 32;
const WELCOME_LOGO_HEIGHT = 31;
const HEADER_NARROW_MAX_WIDTH = 480;
const MOBILE_LOGO_SIZE = 24;
const WELCOME_VERTICAL_INDENT = 15;
const BOTTOM_PADDING = 10;
const BROWSER_FALLBACK_TOP_PADDING = 30;

export type GlobalLogoBarVariant = "default" | "welcomeMarketing" | "welcomeImmersiveTma";

/** TMA immersive fullscreen on desktop / wide — not the compact phone glyph header. */
export function isTmaFullscreenNonMobileHeader(input: {
  isInTelegram: boolean;
  isNarrowHeader: boolean;
  isTelegramMiniAppDesktop: boolean;
  immersiveFullscreen: boolean;
}): boolean {
  if (!input.isInTelegram || !input.immersiveFullscreen) return false;
  const useCompactHeaderGlyph =
    input.isNarrowHeader && input.isInTelegram && !input.isTelegramMiniAppDesktop;
  return !useCompactHeaderGlyph;
}

/** Logo left + centered product title (not the browser marketing welcome row). */
export function shouldUseTmaImmersiveTitleHeader(
  variant: GlobalLogoBarVariant,
  isTmaFullscreenNonMobile: boolean,
): boolean {
  return isTmaFullscreenNonMobile && variant !== "welcomeMarketing";
}

export function computeLogoTopOffsetPx(
  safeAreaInsetTop: number,
  contentSafeAreaInsetTop: number,
  contentGlyphHeight: number,
): number {
  if (safeAreaInsetTop === 0 && contentSafeAreaInsetTop === 0) {
    return BROWSER_FALLBACK_TOP_PADDING;
  }
  const half = Number.isFinite(contentGlyphHeight) ? contentGlyphHeight / 2 : 16;
  const value = safeAreaInsetTop + contentSafeAreaInsetTop / 2 - half;
  return Number.isFinite(value) ? value : BROWSER_FALLBACK_TOP_PADDING;
}

export function resolveGlobalLogoBarVariant(
  isWelcomeLayout: boolean,
  isInTelegram: boolean,
  mergedImmersiveFullscreen: boolean,
  isTelegramMiniAppDesktop: boolean,
): GlobalLogoBarVariant {
  if (!isWelcomeLayout) return "default";

  if (isInTelegram && !isTelegramMiniAppDesktop) {
    const immersiveWelcome = showGlobalLogoBarOnWelcomeTma(isInTelegram, mergedImmersiveFullscreen);
    return immersiveWelcome ? "welcomeImmersiveTma" : "default";
  }

  const immersiveWelcome = showGlobalLogoBarOnWelcomeTma(isInTelegram, mergedImmersiveFullscreen);
  if (isInTelegram && immersiveWelcome) {
    return "welcomeImmersiveTma";
  }
  if (Platform.OS === "web" && (!isInTelegram || !immersiveWelcome)) {
    return "welcomeMarketing";
  }
  return "default";
}

export function shouldShowGlobalLogoBar(input: {
  isWelcomeLayout: boolean;
  isInTelegram: boolean;
  stableWelcomeImmersiveFullscreen: boolean;
}): boolean {
  if (input.isWelcomeLayout && Platform.OS === "web") {
    return true;
  }
  if (!input.isInTelegram) {
    return false;
  }
  return showGlobalLogoBarOnWelcomeTma(input.isInTelegram, input.stableWelcomeImmersiveFullscreen);
}

export function computeGlobalLogoBarBlockHeight(input: {
  variant: GlobalLogoBarVariant;
  isInTelegram: boolean;
  isTelegramMiniAppDesktop: boolean;
  isNarrowHeader: boolean;
  safeAreaInsetTop: number;
  contentSafeAreaInsetTop: number;
}): number {
  const useCompactHeaderGlyph =
    input.isNarrowHeader && input.isInTelegram && !input.isTelegramMiniAppDesktop;
  const defaultLogoSize = useCompactHeaderGlyph ? MOBILE_LOGO_SIZE : LOGO_HEIGHT;
  const wordmarkForMarketing = useCompactHeaderGlyph ? MOBILE_LOGO_SIZE : WELCOME_LOGO_HEIGHT;
  const logoBlockHeight = defaultLogoSize;
  const headerContentHeight = logoBlockHeight;
  const contentGlyphForTopOffset =
    input.variant === "welcomeMarketing" ? wordmarkForMarketing : headerContentHeight;
  const baseTelegramStyleTop = computeLogoTopOffsetPx(
    input.safeAreaInsetTop,
    input.contentSafeAreaInsetTop,
    contentGlyphForTopOffset,
  );
  const isDesktopTma = input.isInTelegram && input.isTelegramMiniAppDesktop;
  const logoBarTopOffset = isDesktopTma ? WELCOME_VERTICAL_INDENT : baseTelegramStyleTop;
  const topPadGlyph = logoBarTopOffset;
  return topPadGlyph + headerContentHeight + BOTTOM_PADDING;
}

/** Marketing welcome row — only when `shouldShowGlobalLogoBar` and variant is welcomeMarketing. */
export function computeWelcomeMarketingBarHeight(input: {
  isInTelegram: boolean;
  isTelegramMiniAppDesktop: boolean;
  isNarrowHeader: boolean;
  safeAreaInsetTop: number;
  contentSafeAreaInsetTop: number;
}): number {
  const useCompactHeaderGlyph =
    input.isNarrowHeader && input.isInTelegram && !input.isTelegramMiniAppDesktop;
  const wordmarkForMarketing = useCompactHeaderGlyph ? MOBILE_LOGO_SIZE : WELCOME_LOGO_HEIGHT;
  const baseTelegramStyleTop = computeLogoTopOffsetPx(
    input.safeAreaInsetTop,
    input.contentSafeAreaInsetTop,
    wordmarkForMarketing,
  );
  const contentPaddingTop =
    input.isInTelegram && !input.isTelegramMiniAppDesktop
      ? baseTelegramStyleTop
      : WELCOME_VERTICAL_INDENT;
  return contentPaddingTop + wordmarkForMarketing + WELCOME_VERTICAL_INDENT;
}

/**
 * Distance from the top of the viewport to the bottom of the sticky global logo bar
 * (including its bottom border). Zero when the bar is hidden.
 */
export function useGlobalLogoBarBottomInsetPx(): number {
  const pathname = useResolvedPathname();
  const auth = useAuth();
  const isWelcomeLayout = isWelcomeLayoutRoute(pathname, auth);
  const {
    isInTelegram,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    layoutStartup,
  } = useTelegram();
  const stableWelcomeImmersiveFullscreen =
    layoutStartup.mergedImmersiveFullscreen || layoutStartup.launchHashFullscreenPositive;
  const isTelegramMiniAppDesktop = layoutStartup.isTelegramMiniAppDesktop;

  const { width: dimensionsWidth } = useWindowDimensions();
  const windowWidth = useMemo(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return Math.max(dimensionsWidth, window.innerWidth || 0);
    }
    return dimensionsWidth;
  }, [dimensionsWidth]);
  const isNarrowHeader = windowWidth <= HEADER_NARROW_MAX_WIDTH;

  return useMemo(() => {
    if (
      !shouldShowGlobalLogoBar({
        isWelcomeLayout,
        isInTelegram,
        stableWelcomeImmersiveFullscreen,
      })
    ) {
      return 0;
    }
    const variant = resolveGlobalLogoBarVariant(
      isWelcomeLayout,
      isInTelegram,
      stableWelcomeImmersiveFullscreen,
      isTelegramMiniAppDesktop,
    );
    const blockHeight =
      variant === "welcomeMarketing"
        ? computeWelcomeMarketingBarHeight({
            isInTelegram,
            isTelegramMiniAppDesktop,
            isNarrowHeader,
            safeAreaInsetTop,
            contentSafeAreaInsetTop,
          })
        : computeGlobalLogoBarBlockHeight({
            variant,
            isInTelegram,
            isTelegramMiniAppDesktop,
            isNarrowHeader,
            safeAreaInsetTop,
            contentSafeAreaInsetTop,
          });
    return blockHeight + GLOBAL_LOGO_BAR_BOTTOM_BORDER_PX;
  }, [
    contentSafeAreaInsetTop,
    isInTelegram,
    isNarrowHeader,
    isTelegramMiniAppDesktop,
    isWelcomeLayout,
    safeAreaInsetTop,
    stableWelcomeImmersiveFullscreen,
  ]);
}
