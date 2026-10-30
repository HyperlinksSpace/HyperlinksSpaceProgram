/**
 * Global logo bar: default header, welcome marketing row (web), or welcome TMA immersive layout.
 * Variant follows route + Telegram viewport (see `resolveLogoBarVariant`).
 */
import React, { useEffect, useMemo } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { appLog } from "../../shared/appLog";
import { useTelegram } from "./Telegram";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";
import { LOGO_WORDMARK_ASPECT, LogoWordmark } from "./LogoWordmark";
import { getTmaInitAndWebAppDebugSnapshot, showGlobalLogoBarOnWelcomeTma } from "./telegramWebApp";
import { layout, typographyFixedRow40Label, useColors } from "../theme";
import { useAuth } from "../../auth/AuthContext";
import { useAppStrings } from "../../locales/AppStringsContext";
import { isWelcomeLayoutRoute } from "../isWelcomeLayoutRoute";
import { useResolvedPathname } from "../useResolvedPathname";
import {
  computeGlobalLogoBarBlockHeight,
  isTmaFullscreenNonMobileHeader,
  resolveGlobalLogoBarVariant,
  shouldShowGlobalLogoBar,
  type GlobalLogoBarVariant,
} from "./globalLogoBarLayout";

const LOGO_HEIGHT = 32;
/** Welcome header glyph height — matches `assets/hslogo*.svg` (94×31). */
const WELCOME_LOGO_HEIGHT = 31;
/** When also in phone TMA, use a smaller 24px header glyph; width alone is not enough (see `useCompactHeaderGlyph`). */
const HEADER_NARROW_MAX_WIDTH = 480;
const MOBILE_LOGO_SIZE = 24;
const WELCOME_VERTICAL_INDENT = 15;
const BOTTOM_PADDING = 10;
const BROWSER_FALLBACK_TOP_PADDING = 30;
const ABOUT_URL = "https://landing.app.hyperlinks.space/";

/**
 * TMA / web top offset for a header glyph, matching `prev-main` Flutter `GlobalLogoBar._getLogoTopPadding`:
 * `safeAreaInsetTop + (contentSafeAreaInsetTop / 2) - (contentGlyphHeight / 2)`.
 * The container height is `top + contentGlyphHeight + bottomPadding` with the glyph centered
 * in the same way as Flutter’s `Container` + `Center` (tight content box, not a separate flex band).
 */
function useLogoTopOffset(
  safeAreaInsetTop: number,
  contentSafeAreaInsetTop: number,
  contentGlyphHeight: number,
): number {
  return useMemo(() => {
    if (safeAreaInsetTop === 0 && contentSafeAreaInsetTop === 0) {
      return BROWSER_FALLBACK_TOP_PADDING;
    }
    const half = Number.isFinite(contentGlyphHeight) ? contentGlyphHeight / 2 : 16;
    const value = safeAreaInsetTop + contentSafeAreaInsetTop / 2 - half;
    return Number.isFinite(value) ? value : BROWSER_FALLBACK_TOP_PADDING;
  }, [safeAreaInsetTop, contentSafeAreaInsetTop, contentGlyphHeight]);
}

type LogoBarVariant = GlobalLogoBarVariant;

function resolveLogoBarVariant(
  isWelcomeLayout: boolean,
  isInTelegram: boolean,
  mergedImmersiveFullscreen: boolean,
  isTelegramMiniAppDesktop: boolean,
): LogoBarVariant {
  return resolveGlobalLogoBarVariant(
    isWelcomeLayout,
    isInTelegram,
    mergedImmersiveFullscreen,
    isTelegramMiniAppDesktop,
  );
}

function WelcomeMarketingBarContent({
  backgroundColor,
  borderBottomColor,
  hideTopBorder,
  wordmarkHeight,
  contentPaddingTop,
  contentPaddingBottom,
}: {
  backgroundColor: string;
  borderBottomColor: string;
  hideTopBorder: boolean;
  wordmarkHeight: number;
  contentPaddingTop: number;
  contentPaddingBottom: number;
}) {
  const { t } = useAppStrings();
  const { triggerHaptic } = useTelegram();
  const colors = useColors();
  // Dark: hslogo dark (white wordmark). Light: hslogo light (black wordmark).
  const logoTextColor = colors.primary;
  const wordmarkWidth = LOGO_WORDMARK_ASPECT * wordmarkHeight;

  const onAbout = () => {
    if (Platform.OS !== "web") {
      triggerHaptic("light");
    }
    void Linking.openURL(ABOUT_URL);
  };

  return (
    <View
      style={[
        styles.marketingBar,
        {
          // Equal top/bottom padding + centered row → logo sits on the header’s vertical midpoint.
          paddingTop: contentPaddingTop,
          paddingBottom: contentPaddingBottom,
          paddingHorizontal: layout.contentSideInsetPx,
          backgroundColor,
          borderTopColor: borderBottomColor,
          borderBottomColor,
          borderTopWidth: hideTopBorder ? 0 : 1,
          justifyContent: "center",
        },
      ]}
    >
      <View style={[styles.marketingRow, { minHeight: wordmarkHeight }]}>
        <View
          style={[styles.marketingLeft, { height: wordmarkHeight, justifyContent: "center" }]}
          accessible
          accessibilityLabel={t("global.logoBar.wordmarkA11y")}
        >
          <LogoWordmark
            width={wordmarkWidth}
            height={wordmarkHeight}
            textColor={logoTextColor}
          />
        </View>
        <Pressable
          onPress={onAbout}
          style={[styles.aboutHit, { minHeight: wordmarkHeight }]}
          accessibilityRole="link"
          accessibilityLabel={t("global.logoBar.about")}
          accessibilityHint={t("global.logoBar.aboutHint")}
        >
          <Text style={[styles.aboutText, { color: colors.primary }]}>{t("global.logoBar.about")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function GlobalLogoBar() {
  const { t } = useAppStrings();
  const router = useRouter();
  const pathname = useResolvedPathname();
  const auth = useAuth();
  // Keep root header neutral until auth is fully known to avoid wrong-header flashes.
  const isWelcomeLayout = isWelcomeLayoutRoute(pathname, auth);
  const colors = useColors();
  const {
    isInTelegram,
    triggerHaptic,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    layoutStartup,
    themeBgReady,
  } = useTelegram();
  const mergedImmersiveFullscreen = layoutStartup.mergedImmersiveFullscreen;
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
  const useCompactHeaderGlyph = isNarrowHeader && isInTelegram && !isTelegramMiniAppDesktop;
  const defaultLogoSize = useCompactHeaderGlyph ? MOBILE_LOGO_SIZE : LOGO_HEIGHT;

  const backgroundColor = themeBgReady ? colors.background : "transparent";

  const variant = resolveLogoBarVariant(
    isWelcomeLayout,
    isInTelegram,
    stableWelcomeImmersiveFullscreen,
    isTelegramMiniAppDesktop,
  );
  const isTmaFullscreenNonMobile = isTmaFullscreenNonMobileHeader({
    isInTelegram,
    isNarrowHeader,
    isTelegramMiniAppDesktop,
    immersiveFullscreen: stableWelcomeImmersiveFullscreen,
  });
  /** Immersive TMA on desktop / wide: N logo left, product title centered in the header row. */
  const isTmaImmersiveTitleHeader =
    variant === "welcomeImmersiveTma" && isTmaFullscreenNonMobile;
  const hideHeaderTopBorder = isInTelegram && !isTelegramMiniAppDesktop;

  useEffect(() => {
    if (!isWelcomeLayout) return;
    const payload = {
      variant,
      isInTelegram,
      isFullscreenContext: mergedImmersiveFullscreen,
      showDefaultLogoOnWelcomeTma: showGlobalLogoBarOnWelcomeTma(
        isInTelegram,
        stableWelcomeImmersiveFullscreen,
      ),
      initAndWebApp: getTmaInitAndWebAppDebugSnapshot(),
    };
    appLog("[GlobalLogoBar]", "welcome_header_variant", payload);
  }, [isWelcomeLayout, variant, isInTelegram, mergedImmersiveFullscreen, stableWelcomeImmersiveFullscreen]);

  /**
   * Logo-only bar (signed-in home + TMA welcome): one rhythm — same glyph size and Telegram top offset
   * as the home header. The old `welcomeImmersiveTma` path used 15px bands + 40px logo and looked
   * misaligned next to the native TMA title row compared to the wallet home screen.
   */
  const logoBlockHeight = defaultLogoSize;
  const wordmarkForMarketing = useCompactHeaderGlyph ? MOBILE_LOGO_SIZE : WELCOME_LOGO_HEIGHT;
  const headerContentHeight = logoBlockHeight;
  /** Same as Flutter: offset matches the glyph you’re placing (N logo, wordmark, or welcome size). */
  const contentGlyphForTopOffset =
    variant === "welcomeMarketing" ? wordmarkForMarketing : headerContentHeight;
  const baseTelegramStyleTop = useLogoTopOffset(
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    contentGlyphForTopOffset,
  );
  /**
   * Desktop TMA (Telegram Desktop, etc.): `safeArea` / `contentSafeArea` from WebApp are often
   * relative to a viewport that already sits below the client’s titlebar — applying the full
   * Flutter-style offset adds a second band of empty space above the bar.
   */
  const isDesktopTma = isInTelegram && isTelegramMiniAppDesktop;

  const blockHeight = computeGlobalLogoBarBlockHeight({
    variant,
    isInTelegram,
    isTelegramMiniAppDesktop,
    isNarrowHeader,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
  });
  const topPadGlyph = isDesktopTma ? WELCOME_VERTICAL_INDENT : baseTelegramStyleTop;

  const shouldShow = useMemo(
    () =>
      shouldShowGlobalLogoBar({
        isWelcomeLayout,
        isInTelegram,
        stableWelcomeImmersiveFullscreen,
      }),
    [isInTelegram, isWelcomeLayout, stableWelcomeImmersiveFullscreen],
  );

  const onPressLogoHome = () => {
    if (Platform.OS !== "web") {
      triggerHaptic("light");
    }
    router.replace("/");
  };

  if (!shouldShow) {
    return <View style={[styles.container, { height: 0, backgroundColor }]} />;
  }

  if (variant === "welcomeMarketing") {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <WelcomeMarketingBarContent
          backgroundColor={backgroundColor}
          borderBottomColor={colors.highlight}
          hideTopBorder={hideHeaderTopBorder}
          wordmarkHeight={wordmarkForMarketing}
          contentPaddingTop={
            isInTelegram && !isTelegramMiniAppDesktop
              ? baseTelegramStyleTop
              : WELCOME_VERTICAL_INDENT
          }
          contentPaddingBottom={WELCOME_VERTICAL_INDENT}
        />
      </View>
    );
  }

  /** Single hairline under the logo bar on home and welcome (marketing row uses its own chrome). */
  const logoBarBottomSeparator = { borderBottomWidth: 1 as const, borderBottomColor: colors.highlight };

  return (
    <View
      style={[
        styles.container,
        { height: blockHeight, backgroundColor, zIndex: 6 },
        isInTelegram
          ? Platform.OS === "web"
            ? ({ position: "sticky", top: 0 } as object)
            : { zIndex: 6 }
          : null,
        logoBarBottomSeparator,
      ]}
    >
      <View
        style={[
          styles.inner,
          isTmaImmersiveTitleHeader && styles.innerAlignStart,
          {
            paddingTop: topPadGlyph,
            paddingBottom: BOTTOM_PADDING,
            paddingHorizontal: layout.contentSideInsetPx,
          },
        ]}
      >
        {isTmaImmersiveTitleHeader ? (
          <View style={[styles.tmaImmersiveHeaderRow, { minHeight: logoBlockHeight }]}>
            <Pressable
              onPress={onPressLogoHome}
              style={[styles.tmaImmersiveLogoLeft, { height: logoBlockHeight, width: logoBlockHeight }]}
              accessibilityRole="button"
              accessibilityLabel={t("key.header.goHomeA11y")}
            >
              <HyperlinksSpaceLogo width={logoBlockHeight} height={logoBlockHeight} />
            </Pressable>
            <View pointerEvents="none" style={styles.tmaImmersiveTitleCenter}>
              <Text
                style={[typographyFixedRow40Label, styles.tmaImmersiveTitle, { color: colors.primary }]}
                numberOfLines={1}
                accessibilityRole="header"
              >
                {t("home.dev.productTitle")}
              </Text>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={onPressLogoHome}
            style={styles.logoWrap}
            accessibilityRole="button"
            accessibilityLabel={t("key.header.goHomeA11y")}
          >
            <View style={[styles.logoBox, { width: logoBlockHeight, height: logoBlockHeight }]}>
              <HyperlinksSpaceLogo width={logoBlockHeight} height={logoBlockHeight} />
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "transparent",
    flexShrink: 0,
  },
  inner: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Match ordinary desktop TMA marketing row: content starts at the same horizontal band. */
  innerAlignStart: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  logoWrap: {
    maxWidth: 600,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrapAlignStart: {
    alignItems: "flex-start",
    alignSelf: "flex-start",
  },
  tmaImmersiveHeaderRow: {
    width: "100%",
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  tmaImmersiveLogoLeft: {
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tmaImmersiveTitleCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tmaImmersiveTitle: {
    textAlign: "center",
    maxWidth: "72%",
  },
  logoBox: {
    width: LOGO_HEIGHT,
    height: LOGO_HEIGHT,
  },
  marketingBar: {
    width: "100%",
    alignSelf: "stretch",
    flexShrink: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  marketingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  marketingLeft: {
    flexShrink: 1,
    marginRight: 12,
    justifyContent: "center",
  },
  aboutHit: {
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  aboutText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "400",
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
});
