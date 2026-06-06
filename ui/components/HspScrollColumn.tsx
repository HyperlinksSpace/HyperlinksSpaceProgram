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
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  scrollIndicatorHairlineBorderWidthPx,
  scrollIndicatorThumbSpanAndOffset,
  snapScrollIndicatorCoordPx,
} from "../scrollIndicatorPx";
import { layout, useColors } from "../theme";
import { SCROLL_INDICATOR_SCROLL_EPS } from "../scrollIndicatorPx";
import { ScrollIndicatorDragHandle } from "./ScrollIndicatorDragHandle";

const DEFAULT_SCROLLBAR_RIGHT_INSET = layout.scrollIndicatorRightInsetPx;

export type HspScrollMetrics = {
  layoutH: number;
  contentH: number;
};

type Props = {
  children: ReactNode;
  /** Scroll thumb color; defaults to theme `accent`. */
  indicatorColor?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Fired when viewport/content heights change (e.g. to toggle scroll vs flex-fill layouts). */
  onMetricsChange?: (metrics: HspScrollMetrics) => void;
  /** Inset (px) of the thumb from the right edge of the scroll shell; default {@link layout.scrollIndicatorRightInsetPx}. */
  scrollbarRightInsetPx?: number;
};

/**
 * Vertical scroll column with the app’s 1px accent hairline indicator (same as {@link MainWebScrollColumn} in root layout).
 */
export function HspScrollColumn({
  children,
  indicatorColor,
  style,
  contentContainerStyle,
  onMetricsChange,
  scrollbarRightInsetPx = DEFAULT_SCROLLBAR_RIGHT_INSET,
}: Props) {
  const colors = useColors();
  const thumbColor = indicatorColor ?? colors.accent;
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const didInitialTopResetRef = useRef(false);
  const [scroll, setScroll] = useState({ layoutH: 0, contentH: 0, scrollY: 0 });

  const syncScrollMetricsFromDom = useCallback(() => {
    if (Platform.OS !== "web") return;
    const instance = scrollRef.current as unknown as {
      getScrollableNode?: () => HTMLElement | null | undefined;
    } | null;
    const el = instance?.getScrollableNode?.();
    if (!el) return;
    const layoutH = el.clientHeight;
    const contentH = el.scrollHeight;
    const scrollYRaw = el.scrollTop;
    const scrollY = scrollYRaw <= SCROLL_INDICATOR_SCROLL_EPS ? 0 : scrollYRaw;
    if (layoutH <= 0) return;
    setScroll((prev) => ({
      ...prev,
      layoutH,
      scrollY,
      ...(contentH > 0 ? { contentH } : {}),
    }));
  }, []);

  /** Reset scroll only on first mount — not when `children` change (e.g. split-pane resize reflow). */
  const didMountScrollResetRef = useRef(false);
  useLayoutEffect(() => {
    if (didMountScrollResetRef.current) return;
    didMountScrollResetRef.current = true;
    if (Platform.OS === "web") {
      const instance = scrollRef.current as unknown as {
        getScrollableNode?: () => HTMLElement | null | undefined;
      } | null;
      const el = instance?.getScrollableNode?.();
      if (el) el.scrollTop = 0;
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    setScroll((prev) => ({ ...prev, scrollY: 0 }));
    if (Platform.OS !== "web") return;
    syncScrollMetricsFromDom();
    const id = requestAnimationFrame(() => {
      syncScrollMetricsFromDom();
      requestAnimationFrame(syncScrollMetricsFromDom);
    });
    return () => cancelAnimationFrame(id);
  }, [syncScrollMetricsFromDom]);

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
    const yRaw = ne.contentOffset.y;
    const y = yRaw <= SCROLL_INDICATOR_SCROLL_EPS ? 0 : yRaw;
    setScroll((prev) => ({
      ...prev,
      scrollY: y,
      ...(ch > 0 ? { contentH: ch } : {}),
    }));
    if (Platform.OS === "web") {
      syncScrollMetricsFromDom();
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const lh = e.nativeEvent.layout.height;
    setScroll((prev) => ({ ...prev, layoutH: lh }));
    if (!didInitialTopResetRef.current) {
      didInitialTopResetRef.current = true;
      requestAnimationFrame(() => {
        if (Platform.OS === "web") {
          const instance = scrollRef.current as unknown as {
            getScrollableNode?: () => HTMLElement | null | undefined;
          } | null;
          const el = instance?.getScrollableNode?.();
          if (el) el.scrollTop = 0;
        } else {
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
        setScroll((prev) => ({ ...prev, scrollY: 0 }));
      });
    }
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

  useEffect(() => {
    onMetricsChange?.({ layoutH: scroll.layoutH, contentH: scroll.contentH });
  }, [scroll.layoutH, scroll.contentH, onMetricsChange]);

  const scrollToY = useCallback(
    (y: number) => {
      const clamped = Math.max(0, y);
      if (Platform.OS === "web") {
        const instance = scrollRef.current as unknown as {
          getScrollableNode?: () => HTMLElement | null | undefined;
        } | null;
        const el = instance?.getScrollableNode?.();
        if (el) el.scrollTop = clamped;
      }
      scrollRef.current?.scrollTo({ y: clamped, animated: false });
      setScroll((prev) => ({ ...prev, scrollY: clamped }));
    },
    [],
  );

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
    const thumbTop =
      scroll.scrollY <= SCROLL_INDICATOR_SCROLL_EPS ? 0 : thumbOffset;
    return { show: true as const, thumbH, thumbTop, maxScroll };
  }, [scroll]);

  return (
    <View style={[styles.shell, style]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {indicator.show ? (
        <View
          style={[
            styles.scrollIndicatorWrap,
            { right: snapScrollIndicatorCoordPx(scrollbarRightInsetPx) },
          ]}
        >
          <ScrollIndicatorDragHandle
            axis="vertical"
            trackSpan={scroll.layoutH}
            thumbSpan={indicator.thumbH}
            thumbOffset={indicator.thumbTop}
            scrollRange={indicator.maxScroll}
            onScrollTo={scrollToY}
            crossAxisVisualSpan={scrollIndicatorHairlineBorderWidthPx()}
          >
            <View
              {...(Platform.OS === "web"
                ? ({ className: "hsp-scroll-indicator-thumb" } as Record<string, string>)
                : {})}
              style={[
                styles.scrollIndicatorThumb,
                {
                  top: 0,
                  height: indicator.thumbH,
                  width: 0,
                  borderLeftWidth: scrollIndicatorHairlineBorderWidthPx(),
                  borderLeftColor: thumbColor,
                  borderStyle: "solid",
                },
              ]}
            />
          </ScrollIndicatorDragHandle>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    alignSelf: "stretch",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 0,
  },
  scrollIndicatorWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 0,
    overflow: "visible",
    zIndex: layout.authenticatedHome.scrollIndicatorOverlayZIndex,
    pointerEvents: "box-none",
  },
  scrollIndicatorThumb: {
    position: "absolute",
    right: 0,
    top: 0,
  },
});
