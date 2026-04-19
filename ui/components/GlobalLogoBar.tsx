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
} from "react-native";
import { useRouter } from "expo-router";
import { useTelegram } from "./Telegram";
import { HyperlinksSpaceLogo } from "./HyperlinksSpaceLogo";
import { LogoWordmark } from "./LogoWordmark";
import { getTmaInitAndWebAppDebugSnapshot, showGlobalLogoBarOnWelcomeTma } from "./telegramWebApp";
import { dark, light, useColors } from "../theme";
import { useResolvedPathname } from "../useResolvedPathname";

const LOGO_HEIGHT = 32;
const WELCOME_LOGO_HEIGHT = 40;
const WELCOME_WORDMARK_WIDTH = (104 / 40) * WELCOME_LOGO_HEIGHT;
const WELCOME_VERTICAL_INDENT = 15;
const BOTTOM_PADDING = 10;
const HORIZONTAL_PADDING = 15;
const MARKETING_HORIZONTAL_PADDING = 16;
const BROWSER_FALLBACK_TOP_PADDING = 30;
const ABOUT_URL = "https://landing.app.hyperlinks.space/";

type LogoBarVariant = "default" | "welcomeMarketing" | "welcomeImmersiveTma";

function resolveLogoBarVariant(
  pathname: string,
  isInTelegram: boolean,
  mergedImmersiveFullscreen: boolean,
  isTelegramMiniAppDesktop: boolean,
): LogoBarVariant {
  if (pathname !== "/welcome") return "default";

  // Mobile TMA: never the marketing row (wordmark + About); logo-only — default or immersive.
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

function useLogoTopPadding(
  safeAreaInsetTop: number,
  contentSafeAreaInsetTop: number,
): number {
  return useMemo(() => {
    if (safeAreaInsetTop === 0 && contentSafeAreaInsetTop === 0) {
      return BROWSER_FALLBACK_TOP_PADDING;
    }
    const value = safeAreaInsetTop + contentSafeAreaInsetTop / 2 - 16;
    return Number.isFinite(value) ? value : BROWSER_FALLBACK_TOP_PADDING;
  }, [safeAreaInsetTop, contentSafeAreaInsetTop]);
}

function WelcomeMarketingBarContent({
  backgroundColor,
  borderBottomColor,
}: {
  backgroundColor: string;
  borderBottomColor: string;
}) {
  const { triggerHaptic } = useTelegram();
  const colors = useColors();
  const logoTextColor = colors.primary === light.primary ? dark.background : light.background;

  const onAbout = () => {
    triggerHaptic("light");
    void Linking.openURL(ABOUT_URL);
  };

  return (
    <View
      style={[
        styles.marketingBar,
        {
          paddingTop: WELCOME_VERTICAL_INDENT,
          paddingBottom: WELCOME_VERTICAL_INDENT,
          paddingHorizontal: MARKETING_HORIZONTAL_PADDING,
          backgroundColor,
          borderBottomColor,
        },
      ]}
    >
      <View style={styles.marketingRow}>
        <View style={styles.marketingLeft} accessible accessibilityLabel="Hyperlinks Space">
          <LogoWordmark
            width={WELCOME_WORDMARK_WIDTH}
            height={WELCOME_LOGO_HEIGHT}
            textColor={logoTextColor}
          />
        </View>
        <Pressable
          onPress={onAbout}
          style={styles.aboutHit}
          accessibilityRole="link"
          accessibilityLabel="About"
          accessibilityHint="Opens the Hyperlinks Space Program landing page in the browser"
        >
          <Text style={[styles.aboutText, { color: colors.primary }]}>About</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function GlobalLogoBar() {
  const router = useRouter();
  const pathname = useResolvedPathname();
  const colors = useColors();
  const {
    isInTelegram,
    triggerHaptic,
    safeAreaInsetTop,
    contentSafeAreaInsetTop,
    layoutStartup,
    isExpanded,
    themeBgReady,
  } = useTelegram();
  const mergedImmersiveFullscreen = layoutStartup.mergedImmersiveFullscreen;
  const isTelegramMiniAppDesktop = layoutStartup.isTelegramMiniAppDesktop;

  const backgroundColor = themeBgReady ? colors.background : "transparent";

  const variant = resolveLogoBarVariant(
    pathname,
    isInTelegram,
    mergedImmersiveFullscreen,
    isTelegramMiniAppDesktop,
  );
  const isWelcome = pathname === "/welcome";

  useEffect(() => {
    if (pathname !== "/welcome") return;
    console.log("[GlobalLogoBar] /welcome header variant", {
      variant,
      isInTelegram,
      isFullscreenContext: mergedImmersiveFullscreen,
      showDefaultLogoOnWelcomeTma: showGlobalLogoBarOnWelcomeTma(
        isInTelegram,
        mergedImmersiveFullscreen,
      ),
      initAndWebApp: getTmaInitAndWebAppDebugSnapshot(),
    });
  }, [pathname, variant, isInTelegram, mergedImmersiveFullscreen]);

  const topPadding = useLogoTopPadding(safeAreaInsetTop, contentSafeAreaInsetTop);
  const useWelcomeCenteredLogoLayout = variant === "welcomeImmersiveTma";
  const logoBlockHeight = useWelcomeCenteredLogoLayout ? WELCOME_LOGO_HEIGHT : LOGO_HEIGHT;
  const innerPaddingTop = useWelcomeCenteredLogoLayout ? WELCOME_VERTICAL_INDENT : topPadding;
  const innerPaddingBottom = useWelcomeCenteredLogoLayout ? WELCOME_VERTICAL_INDENT : BOTTOM_PADDING;
  const blockHeight = innerPaddingTop + logoBlockHeight + innerPaddingBottom;

  const shouldShow = useMemo(() => {
    if (isWelcome && Platform.OS === "web") {
      return true;
    }
    if (!isInTelegram) return true;
    if (pathname === "/welcome") {
      if (!isTelegramMiniAppDesktop) {
        return true;
      }
      return showGlobalLogoBarOnWelcomeTma(isInTelegram, mergedImmersiveFullscreen);
    }
    return isExpanded;
  }, [
    isInTelegram,
    pathname,
    mergedImmersiveFullscreen,
    isExpanded,
    isWelcome,
    isTelegramMiniAppDesktop,
  ]);

  const onPressLogoHome = () => {
    triggerHaptic("light");
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
        />
      </View>
    );
  }

  const welcomeBottomBorder = useWelcomeCenteredLogoLayout
    ? { borderBottomWidth: 1 as const, borderBottomColor: colors.highlight }
    : null;

  return (
    <View
      style={[
        styles.container,
        { height: blockHeight, backgroundColor },
        welcomeBottomBorder,
      ]}
    >
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
          onPress={onPressLogoHome}
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
    flexShrink: 0,
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
  marketingBar: {
    width: "100%",
    alignSelf: "stretch",
    flexShrink: 0,
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
  },
  aboutHit: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  aboutText: {
    fontSize: 16,
    fontWeight: "400",
  },
});
