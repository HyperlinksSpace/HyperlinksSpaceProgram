import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";
import { useTelegram } from "./Telegram";
import { useAppStrings } from "../../locales/AppStringsContext";
import { layout, typographySansSemibold, useColors } from "../theme";

/** Match `GlobalLogoBar` default signed-in / TMA logo strip rhythm. */
const BROWSER_FALLBACK_TOP_PADDING = 30;
const LOGO_HEIGHT = 32;
const HEADER_NARROW_MAX_WIDTH = 480;
const MOBILE_LOGO_SIZE = 24;
const BOTTOM_PADDING = 10;
const WELCOME_VERTICAL_INDENT = 15;

/** Browser swap/key header back control (outside TMA). */
const BROWSER_BACK_BUTTON_HEIGHT_PX = 30;
const BROWSER_BACK_BUTTON_HORIZONTAL_INSET_PX = 11;
const BROWSER_BACK_BUTTON_LEFT_OFFSET_PX = 20;

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

type Props = {
  /** Narrow browser `/swap`: Back control outside Telegram (hidden in TMA and on `/key`). */
  showBrowserBackButton?: boolean;
};

/**
 * Single centered N-mark header (no wordmark, no side actions). Same vertical rhythm as
 * {@link GlobalLogoBar} logo-only mode; optional tap returns home.
 */
export function CenteredLogoOnlyHeader({ showBrowserBackButton = false }: Props) {
  const { t } = useAppStrings();
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
  /** Browser / outside TMA: symmetric vertical padding so the glyph centers in the header strip. */
  const outsideTma = !isInTelegram;
  const showBack = outsideTma && showBrowserBackButton;
  const containerPadding = outsideTma
    ? { paddingVertical: WELCOME_VERTICAL_INDENT }
    : { paddingTop: logoBarTopOffset, paddingBottom: BOTTOM_PADDING };

  const goHome = () => {
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
          ...containerPadding,
          paddingHorizontal: showBack ? 0 : layout.contentSideInsetPx,
        },
      ]}
    >
      {showBack ? (
        <View pointerEvents="box-none" style={styles.backSlot}>
          <Pressable
            onPress={goHome}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
          >
            <Text style={[typographySansSemibold, styles.backLabel, { color: colors.highlight }]}>
              {t("common.back")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        onPress={goHome}
        style={styles.logoWrap}
        accessibilityRole="button"
        accessibilityLabel={t("key.header.goHomeA11y")}
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
    position: "relative",
  },
  backSlot: {
    position: "absolute",
    left: BROWSER_BACK_BUTTON_LEFT_OFFSET_PX,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  backButton: {
    height: BROWSER_BACK_BUTTON_HEIGHT_PX,
    paddingHorizontal: BROWSER_BACK_BUTTON_HORIZONTAL_INSET_PX,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backLabel: {
    fontSize: 15,
    lineHeight: BROWSER_BACK_BUTTON_HEIGHT_PX,
    textAlign: "center",
    textAlignVertical: "center",
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
