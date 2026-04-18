/**
 * Global logo bar: same layout and behaviour as Dart GlobalLogoBar.
 * All Telegram data from useTelegram() (single source: Telegram.ts / Telegram.tsx).
 */
import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTelegram } from "./Telegram";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";
import { isMobileWebUserAgent } from "./telegramWebApp";
import { useColors } from "../theme";

const LOGO_HEIGHT = 32;
const WELCOME_LOGO_HEIGHT = 40;
const WELCOME_VERTICAL_INDENT = 15;
const BOTTOM_PADDING = 10;
const HORIZONTAL_PADDING = 15;
const BROWSER_FALLBACK_TOP_PADDING = 30;

function useLogoTopPadding(
  safeAreaInsetTop: number,
  contentSafeAreaInsetTop: number
): number {
  return useMemo(() => {
    if (safeAreaInsetTop === 0 && contentSafeAreaInsetTop === 0) {
      return BROWSER_FALLBACK_TOP_PADDING;
    }
    const value = safeAreaInsetTop + contentSafeAreaInsetTop / 2 - 16;
    return Number.isFinite(value) ? value : BROWSER_FALLBACK_TOP_PADDING;
  }, [safeAreaInsetTop, contentSafeAreaInsetTop]);
}

const WELCOME_BORDER = { borderBottomWidth: 1 as const, borderBottomColor: "#818181" as const };

export function GlobalLogoBar() {
  const router = useRouter();
  const pathname = usePathname();
  const colors = useColors();
  const {
    isInTelegram,
    triggerHaptic,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    isFullscreen,
    themeBgReady,
  } = useTelegram();

  const backgroundColor = themeBgReady ? colors.background : "transparent";

  const topPadding = useLogoTopPadding(safeAreaInsetTop, contentSafeAreaInsetTop);
  const isWelcome = pathname === "/welcome";
  const logoBlockHeight = isWelcome ? WELCOME_LOGO_HEIGHT : LOGO_HEIGHT;
  const innerPaddingTop = isWelcome ? WELCOME_VERTICAL_INDENT : topPadding;
  const innerPaddingBottom = isWelcome ? WELCOME_VERTICAL_INDENT : BOTTOM_PADDING;
  const blockHeight = innerPaddingTop + logoBlockHeight + innerPaddingBottom;

  const isMobileTmaWeb = useMemo(
    () => Platform.OS === "web" && isMobileWebUserAgent(),
    [],
  );

  const shouldShow = useMemo(() => {
    if (!isInTelegram) return true;
    if (isFullscreen) return true;
    if (isMobileTmaWeb) return true;
    return false;
  }, [isInTelegram, isFullscreen, isMobileTmaWeb]);

  const onPress = () => {
    triggerHaptic("light");
    router.replace("/");
  };

  if (!shouldShow) {
    return <View style={[styles.container, { height: 0, backgroundColor }]} />;
  }

  const welcomeBottomBorder = isWelcome ? WELCOME_BORDER : null;

  return (
    <View style={[styles.container, { height: blockHeight, backgroundColor }, welcomeBottomBorder]}>
      <View
        style={[
          styles.inner,
          {
            paddingTop: innerPaddingTop,
            paddingBottom: innerPaddingBottom,
            paddingHorizontal: HORIZONTAL_PADDING,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "transparent",
    flexShrink: 0, /* keep header fixed height when keyboard opens (flex layout, no shift) */
  },
  inner: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    maxWidth: 600,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    width: LOGO_HEIGHT,
    height: LOGO_HEIGHT,
  },
});
