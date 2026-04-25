import "../global.css";
import {
  View,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  AppState,
  Alert,
  ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { TelegramProvider, useTelegram } from "../ui/components/Telegram";
import { GlobalLogoBarWithFallback } from "../ui/components/GlobalLogoBarWithFallback";
import { GlobalBottomBar } from "../ui/components/GlobalBottomBar";
import { FloatingShield } from "../ui/components/FloatingShield";
import { logBuildSnapshotOnce, logPageDisplay } from "../ui/pageDisplayLog";
import { isWelcomeLayoutRoute } from "../ui/isWelcomeLayoutRoute";
import { useColors } from "../ui/theme";
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

/**
 * Three-block column layout (same as Flutter):
 * 1. Logo bar (optional in TMA when not fullscreen)
 * 2. Main area (flex, scrollable per screen) – Stack updates on route change
 * 3. AI & Search bar (fixed at bottom, platform-specific internals)
 */
export default function RootLayout() {
  useOtaUpdateChecks();
  return (
    <TelegramProvider>
      <AuthProvider>
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
      </AuthProvider>
    </TelegramProvider>
  );
}

function useOtaUpdateChecks() {
  const lastCheckAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const checkForOtaUpdate = async () => {
      const now = Date.now();
      // Throttle checks to avoid noisy network calls while app toggles foreground quickly.
      if (now - lastCheckAtRef.current < 10 * 60 * 1000) return;
      lastCheckAtRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        await Updates.fetchUpdateAsync();
        Alert.alert(
          "Update ready",
          "A new version has been downloaded. Restart now to apply it?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Restart",
              onPress: () => {
                void Updates.reloadAsync();
              },
            },
          ],
        );
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
  }, []);
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
  useWebViewportAllowsPageZoom();
  const pathname = useResolvedPathname();
  const auth = useAuth();
  const { authHydrated, authReady, isAuthenticated } = auth;
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

  return (
    <View
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
        <MainWebScrollColumn
          indicatorColor={colors.highlight}
          scrollTrackColor={backgroundColor}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </MainWebScrollColumn>
      ) : (
        <View style={styles.main}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      )}
      {
        // Avoid mounting web internals before theme — kills dark flash from RN-web inputs.
        Platform.OS !== "web" || !useTelegramTheme || themeBgReady ? <GlobalBottomBar /> : null
      }
      {authHydrated && authReady && (isAuthenticated || isWelcomeLayoutRoute(pathname, auth)) ? (
        <FloatingShield />
      ) : null}
    </View>
  );
}

/**
 * Web: `global.css` keeps vertical overflow in the app column; root allows horizontal overflow when zoomed.
 * Custom indicator: 1px vertical line, theme highlight color, 3px inset from the right of this column.
 * Hidden until content height is known and exceeds the viewport (web: DOM sync on load + ResizeObserver).
 */
function MainWebScrollColumn({
  children,
  indicatorColor,
  scrollTrackColor,
}: {
  children: ReactNode;
  indicatorColor: string;
  /** Scrollbar track: usually app background so the thumb (highlight) is the only accent. */
  scrollTrackColor: string;
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
    if (layoutH <= 0) return;
    setScroll((prev) => ({
      ...prev,
      layoutH,
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

  /** Theme the native OS scrollbar (still shown when `overflow: auto`); uses highlight thumb, not hint/secondary. */
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const run = () => {
      const instance = scrollRef.current as unknown as {
        getScrollableNode?: () => HTMLElement | null | undefined;
      } | null;
      const el = instance?.getScrollableNode?.();
      if (el?.style) {
        el.style.setProperty("scrollbar-color", `${indicatorColor} ${scrollTrackColor}`);
      }
    };
    const id = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    return () => cancelAnimationFrame(id);
  }, [indicatorColor, scrollTrackColor, children]);

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
    const th = (viewH / contentH) * viewH;
    const maxScroll = Math.max(1e-6, contentH - viewH);
    const tt = (y / maxScroll) * Math.max(0, viewH - th);
    return { show: true as const, thumbH: th, thumbTop: tt };
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
        <View style={styles.scrollIndicatorWrap}>
          <View
            style={[
              styles.scrollIndicatorThumb,
              {
                backgroundColor: indicatorColor,
                top: indicator.thumbTop,
                height: indicator.thumbH,
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
    right: 3,
    width: 1,
    zIndex: 20,
    pointerEvents: "none",
  },
  scrollIndicatorThumb: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
  },
});
