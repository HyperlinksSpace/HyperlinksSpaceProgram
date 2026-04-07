/**
 * Global logo bar: same layout and behaviour as Dart GlobalLogoBar.
 * All Telegram data from useTelegram() (single source: Telegram.ts / Telegram.tsx).
 */
import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTelegram } from "./Telegram";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";
import { useColors } from "../theme";

const LOGO_HEIGHT = 32;
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

export function GlobalLogoBar() {
  const router = useRouter();
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
  const blockHeight = topPadding + LOGO_HEIGHT + BOTTOM_PADDING;

  const shouldShow = useMemo(() => {
    if (!isInTelegram) return true;
    return isFullscreen;
  }, [isInTelegram, isFullscreen]);

  const onPress = () => {
    triggerHaptic("light");
    router.replace("/");
  };

  if (!shouldShow) {
    return <View style={[styles.container, { height: 0, backgroundColor }]} />;
  }

  return (
    <View style={[styles.container, { height: blockHeight, backgroundColor }]}>
      <View
        style={[
          styles.inner,
          {
            paddingTop: topPadding,
            paddingBottom: BOTTOM_PADDING,
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
          <View style={styles.logoBox}>
            <HyperlinksSpaceLogo width={LOGO_HEIGHT} height={LOGO_HEIGHT} />
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
