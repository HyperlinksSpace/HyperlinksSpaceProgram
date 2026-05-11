import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";
import { useTelegram } from "./Telegram";
import { layout, useColors } from "../theme";

/** Match `GlobalLogoBar` default signed-in / TMA logo strip rhythm. */
const BROWSER_FALLBACK_TOP_PADDING = 30;
const LOGO_HEIGHT = 32;
const HEADER_NARROW_MAX_WIDTH = 480;
const MOBILE_LOGO_SIZE = 24;
const BOTTOM_PADDING = 10;
const WELCOME_VERTICAL_INDENT = 15;

function useLogoGlyphTopOffset(
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

/**
 * Single centered N-mark header (no wordmark, no side actions). Same vertical rhythm as
 * {@link GlobalLogoBar} logo-only mode; optional tap returns home.
 */
export function CenteredLogoOnlyHeader() {
  const router = useRouter();
  const colors = useColors();
  const {
    isInTelegram,
    triggerHaptic,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    layoutStartup,
  } = useTelegram();
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
  const logoBlockHeight = useCompactHeaderGlyph ? MOBILE_LOGO_SIZE : LOGO_HEIGHT;

  const baseTelegramStyleTop = useLogoGlyphTopOffset(
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    logoBlockHeight,
  );
  const isDesktopTma = isInTelegram && isTelegramMiniAppDesktop;
  const logoBarTopOffset = isDesktopTma ? WELCOME_VERTICAL_INDENT : baseTelegramStyleTop;

  const onPress = () => {
    if (Platform.OS !== "web") {
      triggerHaptic("light");
    }
    router.replace("/");
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.highlight,
          paddingTop: logoBarTopOffset,
          paddingBottom: BOTTOM_PADDING,
          paddingHorizontal: layout.contentSideInsetPx,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={styles.logoWrap}
        accessibilityRole="button"
        accessibilityLabel="Go to home"
      >
        <View style={[styles.logoBox, { width: logoBlockHeight, height: logoBlockHeight }]}>
          <HyperlinksSpaceLogo width={logoBlockHeight} height={logoBlockHeight} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignSelf: "stretch",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    width: LOGO_HEIGHT,
    height: LOGO_HEIGHT,
  },
});
