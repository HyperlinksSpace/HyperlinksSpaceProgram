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
import type { ComponentRef } from "react";
import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { AuthProvider } from "../auth/AuthContext";
import { TelegramProvider, useTelegram } from "../ui/components/Telegram";
import { GlobalLogoBarWithFallback } from "../ui/components/GlobalLogoBarWithFallback";
import { GlobalBottomBar } from "../ui/components/GlobalBottomBar";
import { useColors } from "../ui/theme";
import { useResolvedPathname } from "../ui/useResolvedPathname";
import { showGlobalLogoBarOnWelcomeTma } from "../ui/components/telegramWebApp";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  const colors = useColors();
  const { themeBgReady, useTelegramTheme, isInTelegram, isFullscreen, isExpanded } = useTelegram();
  const backgroundColor = themeBgReady ? colors.background : "transparent";
  // Stronger than opacity:0 — avoids one frame of dark RN-web compositing before themeBgReady.
  const hideWebUntilTheme =
    Platform.OS === "web" && useTelegramTheme && !themeBgReady;

  const showGlobalLogoBar =
    pathname == null || pathname === ""
      ? true
      : pathname !== "/welcome"
        ? !isInTelegram || isExpanded
        : Platform.OS === "web" ||
          showGlobalLogoBarOnWelcomeTma(isInTelegram, isFullscreen);

  return (
    <View
      style={[
        styles.root,
        Platform.OS === "web" ? styles.rootWeb : styles.rootOverflowHidden,
        {
          backgroundColor,
          opacity: themeBgReady ? 1 : 0,
          pointerEvents: themeBgReady ? "auto" : "none",
          ...(Platform.OS === "web"
            ? { display: hideWebUntilTheme ? "none" : "flex" }
            : {}),
        },
      ]}
    >
      {showGlobalLogoBar ? <GlobalLogoBarWithFallback /> : null}
      {Platform.OS === "web" ? (
        <MainWebScrollColumn indicatorColor={colors.secondary}>
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
    </View>
  );
}

/**
 * Web: `global.css` keeps vertical overflow in the app column; root allows horizontal overflow when zoomed.
 * Custom indicator: 1px vertical line, theme secondary color, 3px inset from the right of this column.
 * Hidden until content height is known and exceeds the viewport (web: DOM sync on load + ResizeObserver).
 */
function MainWebScrollColumn({
  children,
  indicatorColor,
}: {
  children: ReactNode;
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
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {indicator.show ? (
        <View style={styles.scrollIndicatorWrap} pointerEvents="none">
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
  scrollIndicatorWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 3,
    width: 1,
    zIndex: 20,
  },
  scrollIndicatorThumb: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
  },
});
