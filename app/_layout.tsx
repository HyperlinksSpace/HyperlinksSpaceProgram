import "../global.css";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { applyPlatformTextDefaults, ensureUiSansFontFamilyDefaults } from "../ui/platformTextDefaults";
import { UI_GOOGLE_FONT_LOAD_MAP } from "../ui/uiGoogleFonts";
import {
  View,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  AppState,
  Alert,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { TelegramProvider, useTelegram } from "../ui/components/Telegram";
import { AppStringsProvider, useAppStrings } from "../locales/AppStringsContext";
import { GlobalLogoBarWithFallback } from "../ui/components/GlobalLogoBarWithFallback";
import { GlobalBottomBar } from "../ui/components/GlobalBottomBar";
import { BottomBarLayoutProvider, useBottomBarLayout } from "../ui/components/BottomBarLayoutContext";
import { FloatingShield } from "../ui/components/FloatingShield";
import { logBuildSnapshotOnce, logPageDisplay } from "../ui/pageDisplayLog";
import { isWelcomeLayoutRoute } from "../ui/isWelcomeLayoutRoute";
import {
  scrollIndicatorHairlineBorderWidthPx,
  scrollIndicatorThumbSpanAndOffset,
  snapScrollIndicatorCoordPx,
} from "../ui/scrollIndicatorPx";
import { authenticatedHomeBottomBarDock, layout, useColors } from "../ui/theme";
import { useResolvedPathname } from "../ui/useResolvedPathname";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";

applyPlatformTextDefaults();

void SplashScreen.preventAutoHideAsync();

/**
 * Three-block column layout (same as Flutter):
 * 1. Logo bar (optional in TMA when not fullscreen)
 * 2. Main area (flex, scrollable per screen) – Stack updates on route change
 * 3. AI & Search bar (fixed at bottom, platform-specific internals)
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(UI_GOOGLE_FONT_LOAD_MAP);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
    if (fontError) {
      console.warn("[fonts] UI font load failed", fontError);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (fontsLoaded) {
    ensureUiSansFontFamilyDefaults();
  }

  return (
    <TelegramProvider>
      <AppStringsProvider>
        <AuthProvider>
          <BottomBarLayoutProvider>
            {Platform.OS === "ios" ? (
              <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior="padding"
                keyboardVerticalOffset={0}
              >
                <RootContent />
              </KeyboardAvoidingView>
            ) : (
              <RootContent />
            )}
          </BottomBarLayoutProvider>
        </AuthProvider>
      </AppStringsProvider>
    </TelegramProvider>
  );
}

/** Web: allow browser pinch/Ctrl+wheel zoom; replaces restrictive scale caps from defaults. */
function useWebViewportAllowsPageZoom() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const cur = meta.getAttribute("content") ?? "";
    const parts = cur
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !/^(maximum-scale|minimum-scale|user-scalable)=/i.test(p));
    parts.push("minimum-scale=0.25", "maximum-scale=5", "user-scalable=yes");
    meta.setAttribute("content", parts.join(", "));
  }, []);
}

function RootContent() {
  /**
   * Web: render a single static shell on the server + on the client's first commit so prerendered HTML
   * matches hydration. The real tree (theme, pathname, Stack) only mounts after useLayoutEffect — that
   * subtree is then a client-only paint, which avoids React #418 from TMA / auth / router divergence.
   * Native: no split (always ready).
   */
  const { t } = useAppStrings();
  const lastOtaCheckAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const checkForOtaUpdate = async () => {
      const now = Date.now();
      if (now - lastOtaCheckAtRef.current < 10 * 60 * 1000) return;
      lastOtaCheckAtRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        await Updates.fetchUpdateAsync();
        Alert.alert(t("ota.title"), t("ota.message"), [
          { text: t("ota.later"), style: "cancel" },
          {
            text: t("ota.restart"),
            onPress: () => {
              void Updates.reloadAsync();
            },
          },
        ]);
      } catch (error) {
        console.warn("[updates] OTA check failed", error);
      }
    };

    void checkForOtaUpdate();
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void checkForOtaUpdate();
      }
    });
    return () => sub.remove();
  }, [t]);

  const [webHydrationReady, setWebHydrationReady] = useState(Platform.OS !== "web");
  useLayoutEffect(() => {
    if (Platform.OS === "web") {
      setWebHydrationReady(true);
    }
  }, []);

  useWebViewportAllowsPageZoom();
  const pathname = useResolvedPathname();
  const auth = useAuth();
  const { authHydrated, authReady, isAuthenticated } = auth;
  const { width: windowWidth } = useWindowDimensions();
  const { setFooterDockedToScreenEdge } = useBottomBarLayout();
  const bottomBarDock = authenticatedHomeBottomBarDock(pathname, windowWidth, isAuthenticated);

  useEffect(() => {
    setFooterDockedToScreenEdge(bottomBarDock === "screenFooter");
  }, [bottomBarDock, setFooterDockedToScreenEdge]);
  const colors = useColors();
  const { themeBgReady, useTelegramTheme, isInTelegram, isExpanded, layoutStartup } = useTelegram();
  const shellLogKeyRef = useRef<string | null>(null);
  // Outside Telegram theme, use app palette immediately (avoids SSR/client mismatch from bootstrapping
  // themeBgReady true on client only). In TMA, wait for WebApp theme before painting.
  const shellPaintReady = themeBgReady || !useTelegramTheme;
  const backgroundColor = shellPaintReady ? colors.background : "transparent";
  // Stronger than opacity:0 — avoids one frame of dark RN-web compositing before themeBgReady.
  const hideWebUntilTheme =
    Platform.OS === "web" && useTelegramTheme && !themeBgReady;

  /** Web: default UA scrollbars (root zoom / any overflow) use `accent` thumb + app background track. */
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !shellPaintReady) return;
    document.documentElement.style.setProperty(
      "scrollbar-color",
      `${colors.accent} ${backgroundColor}`,
    );
    return () => {
      document.documentElement.style.removeProperty("scrollbar-color");
    };
  }, [backgroundColor, colors.accent, shellPaintReady]);

  useEffect(() => {
    logBuildSnapshotOnce("root_layout_mount");
  }, []);

  useEffect(() => {
    const key = [
      pathname ?? "",
      shellPaintReady,
      themeBgReady,
      useTelegramTheme,
      hideWebUntilTheme,
    ].join("|");
    if (shellLogKeyRef.current === key) return;
    shellLogKeyRef.current = key;
    logPageDisplay("root_shell", {
      pathname: pathname ?? null,
      shellPaintReady,
      themeBgReady,
      useTelegramTheme,
      hideWebUntilTheme,
      isInTelegram,
      isExpanded,
    });
  }, [
    pathname,
    shellPaintReady,
    themeBgReady,
    useTelegramTheme,
    hideWebUntilTheme,
    isInTelegram,
    isExpanded,
  ]);

  const showGlobalLogoBar = useMemo(() => {
    if (pathname == null || pathname === "") {
      return true;
    }
    if (
      pathname === "/welcome" ||
      pathname === "/home" ||
      pathname === "/" ||
      pathname === ""
    ) {
      // Keep header mounted on root / legacy routes and let GlobalLogoBar choose the variant.
      // This avoids startup mount/unmount flashes while TMA fullscreen signals settle.
      return true;
    }
    if (isInTelegram && layoutStartup.isTelegramMiniAppDesktop) {
      return false;
    }
    return !isInTelegram || isExpanded;
  }, [pathname, isInTelegram, layoutStartup, isExpanded]);
  const isRootBootstrapPending =
    (pathname === "/" || pathname === "" || pathname == null) &&
    (!authHydrated || !authReady);

  if (Platform.OS === "web" && !webHydrationReady) {
    return (
      <View
        {...(Platform.OS === "web" ? { suppressHydrationWarning: true } : {})}
        style={[styles.root, styles.rootWeb, { backgroundColor: "#000000" }]}
      />
    );
  }

  return (
    <View
      // TMA / Vercel web: theme and display toggles after mount can mismatch pre-hydration HTML (React #418).
      {...(Platform.OS === "web" ? { suppressHydrationWarning: true } : {})}
      style={[
        styles.root,
        Platform.OS === "web" ? styles.rootWeb : styles.rootOverflowHidden,
        {
          backgroundColor,
          opacity: shellPaintReady ? 1 : 0,
          pointerEvents: shellPaintReady ? "auto" : "none",
          ...(Platform.OS === "web"
            ? { display: hideWebUntilTheme ? "none" : "flex" }
            : {}),
        },
      ]}
    >
      {showGlobalLogoBar && !isRootBootstrapPending ? <GlobalLogoBarWithFallback /> : null}
      {Platform.OS === "web" ? (
        <MainWebScrollColumn indicatorColor={colors.accent}>
          <Stack screenOptions={{ headerShown: false }} />
        </MainWebScrollColumn>
      ) : (
        <View style={styles.main}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      )}
      {
        // Avoid mounting web internals before theme — kills dark flash from RN-web inputs.
        // Wide authenticated home mounts the same bar inside split columns instead.
        Platform.OS !== "web" || !useTelegramTheme || themeBgReady ? (
          bottomBarDock === "screenFooter" ? <GlobalBottomBar /> : null
        ) : null
      }
      {authHydrated && authReady && (isAuthenticated || isWelcomeLayoutRoute(pathname, auth)) ? (
        <FloatingShield />
      ) : null}
    </View>
  );
}

/**
 * Web: `global.css` keeps vertical overflow in the app column; root allows horizontal overflow when zoomed.
 * Custom indicator: 1px vertical line, theme `accent`, inset `layout.bottomBar.scrollbarRightInsetPx` from the right.
 * Hidden until content height is known and exceeds the viewport (web: DOM sync on load + ResizeObserver).
 */
function MainWebScrollColumn({
  children,
  indicatorColor,
}: {
  children: ReactNode;
  /** Scroll thumb / overlay line: theme `accent`. */
  indicatorColor: string;
}) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [scroll, setScroll] = useState({ layoutH: 0, contentH: 0, scrollY: 0 });

  /** RN-web: read real scrollHeight vs clientHeight on first paint (onContentSizeChange can lag). */
  const syncScrollMetricsFromDom = useCallback(() => {
    if (Platform.OS !== "web") return;
    const instance = scrollRef.current as unknown as {
      getScrollableNode?: () => HTMLElement | null | undefined;
    } | null;
    const el = instance?.getScrollableNode?.();
    if (!el) return;
    const layoutH = el.clientHeight;
    const contentH = el.scrollHeight;
    const scrollY = el.scrollTop;
    if (layoutH <= 0) return;
    setScroll((prev) => ({
      ...prev,
      layoutH,
      scrollY,
      ...(contentH > 0 ? { contentH } : {}),
    }));
  }, []);

  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    syncScrollMetricsFromDom();
    const id = requestAnimationFrame(() => {
      syncScrollMetricsFromDom();
      requestAnimationFrame(syncScrollMetricsFromDom);
    });
    return () => cancelAnimationFrame(id);
  }, [syncScrollMetricsFromDom, children]);

  /**
   * Web: hide the **native** scrollbar (it is much wider than 1px). Scrolling stays on the same node;
   * the thin custom overlay is drawn in React. `scrollbar-color` alone does not set width.
   */
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const run = () => {
      const instance = scrollRef.current as unknown as {
        getScrollableNode?: () => HTMLElement | null | undefined;
      } | null;
      const el = instance?.getScrollableNode?.();
      if (!el?.style) return;
      el.classList.add("hsp-main-scroll-hide-native-scrollbar");
      el.style.setProperty("scrollbar-width", "none");
      el.style.setProperty("-ms-overflow-style", "none");
    };
    const id = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    return () => cancelAnimationFrame(id);
  }, [children]);

  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof ResizeObserver === "undefined") return;
    const t = requestAnimationFrame(() => {
      resizeObserverRef.current?.disconnect();
      const instance = scrollRef.current as unknown as {
        getScrollableNode?: () => HTMLElement | null | undefined;
      } | null;
      const scrollEl = instance?.getScrollableNode?.();
      if (!scrollEl) return;
      const ro = new ResizeObserver(() => syncScrollMetricsFromDom());
      resizeObserverRef.current = ro;
      ro.observe(scrollEl);
      const inner = scrollEl.firstElementChild;
      if (inner) ro.observe(inner);
    });
    return () => {
      cancelAnimationFrame(t);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [syncScrollMetricsFromDom, children]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const ne = e.nativeEvent;
    const ch = ne.contentSize?.height ?? 0;
    setScroll((prev) => ({
      ...prev,
      scrollY: ne.contentOffset.y,
      ...(ch > 0 ? { contentH: ch } : {}),
    }));
    if (Platform.OS === "web") {
      syncScrollMetricsFromDom();
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const lh = e.nativeEvent.layout.height;
    setScroll((prev) => ({ ...prev, layoutH: lh }));
    if (Platform.OS === "web") {
      requestAnimationFrame(syncScrollMetricsFromDom);
    }
  };

  const onContentSizeChange = (_w: number, h: number) => {
    setScroll((prev) => ({ ...prev, contentH: h }));
    if (Platform.OS === "web") {
      requestAnimationFrame(syncScrollMetricsFromDom);
    }
  };

  const indicator = useMemo(() => {
    const viewH = scroll.layoutH;
    const contentH = scroll.contentH;
    const y = scroll.scrollY;
    if (viewH <= 0 || contentH <= 0 || contentH <= viewH + 0.5) {
      return { show: false as const, thumbH: 0, thumbTop: 0 };
    }
    const maxScroll = Math.max(1e-6, contentH - viewH);
    const { thumbSpan, thumbOffset } = scrollIndicatorThumbSpanAndOffset(
      viewH,
      viewH,
      contentH,
      y,
      maxScroll,
    );
    const hairline = scrollIndicatorHairlineBorderWidthPx();
    const thumbH = Math.max(hairline, thumbSpan);
    const thumbTop = thumbOffset;
    return { show: true as const, thumbH, thumbTop };
  }, [scroll]);

  return (
    <View style={styles.mainShell}>
      <ScrollView
        ref={scrollRef}
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {indicator.show ? (
        <View
          style={[
            styles.scrollIndicatorWrap,
            { right: snapScrollIndicatorCoordPx(layout.bottomBar.scrollbarRightInsetPx) },
          ]}
        >
          <View
            {...(Platform.OS === "web"
              ? ({ className: "hsp-scroll-indicator-thumb" } as Record<string, string>)
              : {})}
            style={[
              styles.scrollIndicatorThumb,
              {
                top: indicator.thumbTop,
                height: indicator.thumbH,
                width: 0,
                borderLeftWidth: scrollIndicatorHairlineBorderWidthPx(),
                borderLeftColor: indicatorColor,
                borderStyle: "solid",
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  root: {
    flex: 1,
    flexDirection: "column",
  },
  /** Native + default clipping */
  rootOverflowHidden: {
    overflow: "hidden",
  },
  /** Web: allow document + inner column to scroll when zoomed (`overflow-y: hidden` on root blocked wheel). */
  rootWeb: {
    minWidth: "100%",
    overflow: "auto",
  } as unknown as ViewStyle,
  main: {
    flex: 1,
    minHeight: 0,
  },
  mainShell: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  mainScroll: {
    flex: 1,
  },
  /** Lets `flex: 1` screens fill at least the column height so centered content is not clipped (RN-web). */
  mainScrollContent: {
    flexGrow: 1,
  },
  scrollIndicatorWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 0,
    overflow: "visible",
    zIndex: 20,
    pointerEvents: "none",
  },
  scrollIndicatorThumb: {
    position: "absolute",
    right: 0,
    top: 0,
  },
});
