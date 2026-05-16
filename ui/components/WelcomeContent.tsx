import { Alert, View, Text, useWindowDimensions, StyleSheet, Platform } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../../api/_base";
import { useAuth } from "../../auth/AuthContext";
import { layout, useColors } from "../theme";
import { useAppStrings } from "../../locales/AppStringsContext";
import { logPageDisplay } from "../pageDisplayLog";
import { WelcomeAuthButtons } from "./WelcomeAuthButtons";
import { isActuallyInTelegram } from "./telegramWebApp";

const CONTENT_GAP_BELOW_HEADER = 20;
const MAX_TEXT_WIDTH = 360;
const WIDE_LAYOUT_MIN_WIDTH = 480;
const GAP_ABOVE_AUTH_BUTTONS = 20;
const SUBTITLE_TOP_INDENT_WIDE = 10;

const HEADING_FONT_WIDE = 35;
const HEADING_LINE_NARROW = 38;
const HEADING_LINE_WIDE = 40;

/**
 * Welcome marketing + auth controls. Rendered at `/` when unauthenticated (same URL as signed-in home).
 */
export function WelcomeContent() {
  const colors = useColors();
  const { t, tf } = useAppStrings();
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
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (isActuallyInTelegram()) return;

    const params = new URLSearchParams(window.location.search);
    const telegramAuthError = params.get("telegramAuthError");
    if (telegramAuthError) {
      logPageDisplay("welcome_telegram_oidc_callback_error", {
        reason: telegramAuthError,
        href: window.location.href,
      });
      Alert.alert(
        t("welcome.auth.telegramBrowserAlertTitle"),
        tf("welcome.auth.telegramCallbackError", { reason: telegramAuthError }),
      );
      params.delete("telegramAuthError");
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, [t, tf]);

  const probeBrowserSession = useCallback(
    async (source: "mount" | "visibility") => {
      const startedAt = Date.now();
      logPageDisplay("welcome_telegram_oidc_session_probe", { source });
      try {
        const sessionUrl = buildApiUrl("/api/auth/session");
        const response = await fetch(sessionUrl, {
          method: "GET",
          credentials: "include",
        });
        const json = (await response.json().catch(() => ({}))) as { authenticated?: boolean };
        const authenticated = response.ok && json?.authenticated === true;
        logPageDisplay("welcome_telegram_oidc_session_probe_result", {
          source,
          status: response.status,
          ok: response.ok,
          authenticated,
          elapsedMs: Date.now() - startedAt,
        });
        if (authenticated) {
          logPageDisplay("welcome_telegram_oidc_sign_in", {
            source,
            elapsedMs: Date.now() - startedAt,
          });
          signIn();
        }
      } catch (error) {
        logPageDisplay("welcome_telegram_oidc_session_probe_error", {
          source,
          message: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - startedAt,
        });
      }
    },
    [signIn],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (isActuallyInTelegram()) return;
    void probeBrowserSession("mount");
  }, [probeBrowserSession]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (isActuallyInTelegram()) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void probeBrowserSession("visibility");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [probeBrowserSession]);

  const isWideLayout = layoutReady && windowWidth > WIDE_LAYOUT_MIN_WIDTH;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          { paddingHorizontal: layout.contentSideInsetPx, paddingTop: CONTENT_GAP_BELOW_HEADER },
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
            {t("welcome.title")}
          </Text>
        </View>
        <View style={[styles.subtitleBlock, isWideLayout && styles.subtitleBlockWide]}>
          <Text style={[styles.subtitleText, { color: colors.secondary }]}>
            {t("welcome.subtitle")}
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
    /** Tighter than 30 — large line boxes sat visually low with Noto in centered blocks. */
    lineHeight: 22,
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
