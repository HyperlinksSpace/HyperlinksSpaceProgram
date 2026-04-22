import { View, Text, useWindowDimensions, StyleSheet, Platform } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../../api/_base";
import { useAuth } from "../../auth/AuthContext";
import { useColors } from "../theme";
import { WelcomeAuthButtons } from "./WelcomeAuthButtons";

const CONTENT_GAP_BELOW_HEADER = 20;
const H_PADDING = 20;
const MAX_TEXT_WIDTH = 360;
const WIDE_LAYOUT_MIN_WIDTH = 480;
const GAP_ABOVE_AUTH_BUTTONS = 20;
const SUBTITLE_TOP_INDENT_WIDE = 10;

const HEADING_FONT_WIDE = 35;
const HEADING_LINE_NARROW = 40;
const HEADING_LINE_WIDE = 42;

/**
 * Welcome marketing + auth controls. Rendered at `/` when unauthenticated (same URL as signed-in home).
 */
export function WelcomeContent() {
  const colors = useColors();
  const { signIn } = useAuth();
  const { width: dimensionsWidth } = useWindowDimensions();
  /** RN-web sometimes reports width 0 on the first frame; `innerWidth` matches the real viewport immediately. */
  const windowWidth = useMemo(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return Math.max(dimensionsWidth, window.innerWidth || 0);
    }
    return dimensionsWidth;
  }, [dimensionsWidth]);
  /** Web: ready on first paint so wide/narrow heading matches viewport (no narrow→wide flash). Native: defer until mount so first layout pass has real dimensions. */
  const [layoutReady, setLayoutReady] = useState(() => Platform.OS === "web");

  useEffect(() => {
    setLayoutReady(true);
  }, []);

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

  const isWideLayout = layoutReady && windowWidth > WIDE_LAYOUT_MIN_WIDTH;

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
