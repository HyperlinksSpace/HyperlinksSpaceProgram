/**
 * Global logo bar matching Dart GlobalLogoBar: same layout, safe area formula,
 * fullscreen-based visibility, haptic on tap, navigate to root.
 * Uses @tma.js/sdk-react for viewport, isFullscreen, and hapticFeedback.
 */
import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import {
  viewport,
  hapticFeedback,
  useLaunchParams,
  useSignal,
} from "@tma.js/sdk-react";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";

const LOGO_HEIGHT = 32;
const BOTTOM_PADDING = 10;
const HORIZONTAL_PADDING = 15;
const BROWSER_FALLBACK_TOP_PADDING = 30;

function useLogoTopPadding(): number {
  const safeTop = useSignal(viewport.safeAreaInsetTop);
  const contentTop = useSignal(viewport.contentSafeAreaInsetTop);

  return useMemo(() => {
    const safe = Number(safeTop ?? 0);
    const content = Number(contentTop ?? 0);
    if (safe === 0 && content === 0) return BROWSER_FALLBACK_TOP_PADDING;
    const value = safe + content / 2 - 16;
    return Number.isFinite(value) ? value : BROWSER_FALLBACK_TOP_PADDING;
  }, [safeTop, contentTop]);
}

function useLogoBlockHeight(): number {
  const topPadding = useLogoTopPadding();
  return topPadding + LOGO_HEIGHT + BOTTOM_PADDING;
}

function useShouldShowLogo(): boolean {
  const launchParams = useLaunchParams(false);
  const isFullscreen = useSignal(viewport.isFullscreen);

  return useMemo(() => {
    const lp = launchParams as
      | { tgWebAppData?: { user?: unknown }; tg_web_app_data?: { user?: unknown } }
      | undefined;
    const hasUser =
      (lp?.tgWebAppData?.user != null || lp?.tg_web_app_data?.user != null) &&
      typeof (lp?.tgWebAppData?.user ?? lp?.tg_web_app_data?.user) === "object";
    if (!hasUser) return true;
    return isFullscreen ?? true;
  }, [launchParams, isFullscreen]);
}

export function GlobalLogoBar() {
  const router = useRouter();
  const topPadding = useLogoTopPadding();
  const blockHeight = useLogoBlockHeight();
  const shouldShow = useShouldShowLogo();

  const onPress = () => {
    try {
      hapticFeedback.impactOccurred?.("light");
    } catch {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        try {
          const w = window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void } } } };
          w.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch {
          // ignore
        }
      }
    }
    router.replace("/");
  };

  if (!shouldShow) {
    return <View style={[styles.container, { height: 0 }]} />;
  }

  return (
    <View style={[styles.container, { height: blockHeight }]}>
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
