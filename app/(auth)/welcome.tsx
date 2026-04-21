import { View, Text, useWindowDimensions, StyleSheet, Platform } from "react-native";
import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { buildApiUrl } from "../../api/_base";
import { useAuth } from "../../auth/AuthContext";
import { useColors } from "../../ui/theme";
import { WelcomeAuthButtons } from "../../ui/components/WelcomeAuthButtons";
import { isTelegramMiniAppEnvironment } from "../../ui/components/telegramWebApp";

const CONTENT_GAP_BELOW_HEADER = 20;
const H_PADDING = 20;
/** Max width for welcome heading + subtitle copy. */
const MAX_TEXT_WIDTH = 360;
const WIDE_LAYOUT_MIN_WIDTH = 480;
const GAP_ABOVE_AUTH_BUTTONS = 20;
/** Wide layout only: space above the subtitle line under the main heading. */
const SUBTITLE_TOP_INDENT_WIDE = 10;

/** Wide headline metrics — keep in StyleSheet so RN-web emits stable classes. */
const HEADING_FONT_WIDE = 35;
/** Thin screens: heading line height; wide screens use {@link HEADING_LINE_WIDE}. */
const HEADING_LINE_NARROW = 40;
const HEADING_LINE_WIDE = 42;

/**
 * Welcome screen: top header is rendered by GlobalLogoBar (marketing vs default by route + TMA mode).
 *
 * Defer welcome UI and `/home` redirect until `authReady` and client mount — static export can ship
 * pre-rendered welcome HTML; redirecting in `useEffect` made the client tree differ → React #418.
 */
export default function WelcomeScreen() {
  const colors = useColors();
  const { signIn, isAuthenticated, authReady } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const [hydrated, setHydrated] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    setClientReady(true);
  }, []);

  /** Web: OAuth may finish in another tab — recheck session when this tab becomes visible. */
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const response = await fetch(buildApiUrl("/api/auth/session"), {
            method: "GET",
            credentials: "include",
          });
          const json = (await response.json().catch(() => ({}))) as { authenticated?: boolean };
          if (response.ok && json?.authenticated === true) {
            signIn();
          }
        } catch {
          /* ignore */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signIn]);

  if (!authReady || !clientReady) {
    return null;
  }

  if (isAuthenticated && !isTelegramMiniAppEnvironment()) {
    return <Redirect href="/home" />;
  }

  const isWideLayout = hydrated && windowWidth > WIDE_LAYOUT_MIN_WIDTH;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          { paddingHorizontal: H_PADDING, paddingTop: CONTENT_GAP_BELOW_HEADER },
        ]}
      >
        <View style={styles.headingBlock}>
          <Text
            style={[
              styles.headingText,
              isWideLayout ? styles.headingTextWide : styles.headingTextNarrow,
              { color: colors.primary },
            ]}
          >
            Welcome to our program
          </Text>
        </View>
        <View style={[styles.subtitleBlock, isWideLayout && styles.subtitleBlockWide]}>
          <Text style={[styles.subtitleText, { color: colors.secondary }]}>
            This is the best way to earn and spend
          </Text>
        </View>
        <View style={styles.authBlock}>
          <WelcomeAuthButtons />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    alignItems: "center",
  },
  subtitleBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
  },
  subtitleBlockWide: {
    marginTop: SUBTITLE_TOP_INDENT_WIDE,
  },
  subtitleText: {
    fontSize: 15,
    lineHeight: 30,
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
    paddingVertical: 0,
  },
  headingBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
  },
  headingText: {
    fontWeight: "400",
    textAlign: "center",
    includeFontPadding: false,
    paddingVertical: 0,
    width: "100%",
    flexShrink: 0,
  },
  headingTextWide: {
    fontSize: HEADING_FONT_WIDE,
    lineHeight: HEADING_LINE_WIDE,
  },
  headingTextNarrow: {
    fontSize: 25,
    lineHeight: HEADING_LINE_NARROW,
  },
  authBlock: {
    width: "100%",
    maxWidth: MAX_TEXT_WIDTH,
    marginTop: GAP_ABOVE_AUTH_BUTTONS,
    alignItems: "center",
  },
});
