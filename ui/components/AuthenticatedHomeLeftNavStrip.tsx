import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../fonts";
import { logPageDisplay } from "../pageDisplayLog";
import { layout, type ThemeColors } from "../theme";
import { useAuthenticatedHomeSplitLayoutMetrics } from "./AuthenticatedHomeSplitLayoutMetricsContext";

const NAV_LABELS = ["Feed", "Messages", "Tasks", "Items", "Coins"] as const;

const AH = layout.authenticatedHome;

/** Total strip height including vertical inner padding. */
const STRIP_HEIGHT_PX = 55;
/** Vertical padding inside strip; horizontal inset is visual-only via edge fades (no horizontal padding on scroll). */
const STRIP_PADDING_PX = layout.contentSideInsetPx;
const INNER_SCROLL_HEIGHT_PX = STRIP_HEIGHT_PX - STRIP_PADDING_PX * 2;
const ITEM_GAP_PX = layout.contentSideInsetPx;
const LABEL_FONT_SIZE = 20;
const LABEL_LINE_HEIGHT = 15;
const SCROLL_EPS = 2;
/** Both horizontal content insets on the strip (`contentSideInsetPx` × 2); matches “width minus 30px” in layout copy. */
const NAV_STRIP_HORIZONTAL_INSET_TOTAL_PX = STRIP_PADDING_PX * 2;
/**
 * Fallback width before the label row’s first `onLayout` (and for scroll-range padding). Slightly
 * conservative vs average glyph width so we don’t prefer scroll mode when the real row is narrower.
 * Once the label row reports `onLayout`, use that width instead (see `stripContentWidthPx`).
 */
const ESTIMATED_NAV_STRIP_CONTENT_W_PX = (() => {
  const charPx = LABEL_FONT_SIZE * 0.82;
  let w = STRIP_PADDING_PX * 2;
  for (let i = 0; i < NAV_LABELS.length; i++) {
    w += NAV_LABELS[i].length * charPx;
    if (i < NAV_LABELS.length - 1) w += ITEM_GAP_PX;
  }
  return Math.ceil(w);
})();

/**
 * Rule thickness in layout units: one **device** pixel (hairline).
 * A `1` css px / 1 dp bar maps to several physical pixels on phones, so it reads as a thick band
 * (often worse in single-column / full-width mobile layouts). This matches ~StyleSheet.hairlineWidth
 * intent but stays consistent with {@link snapToPixelGrid} math on web.
 */
function menuStripRuleThickness(): number {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return 1 / window.devicePixelRatio;
    }
    return 1;
  }
  return PixelRatio.roundToNearestPixel(1 / PixelRatio.get());
}

/**
 * Snap layout coordinates/sizes to the device pixel grid so 1px borders render crisp (no blur between pixels).
 */
function snapToPixelGrid(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      const dpr = window.devicePixelRatio;
      return Math.round(n * dpr) / dpr;
    }
    return Math.round(n);
  }
  return PixelRatio.roundToNearestPixel(n);
}

function windowInferredSplitColumnCount(windowWidthPx: number): 1 | 2 | 3 {
  if (windowWidthPx <= AH.firstBreakpoint) return 1;
  if (windowWidthPx <= AH.secondBreakpoint) return 2;
  return 3;
}

function horizontalThumbFullTrack(
  trackWidth: number,
  viewportWidth: number,
  contentWidth: number,
  scrollX: number,
  scrollRange: number,
): { thumbW: number; thumbLeft: number } {
  if (trackWidth <= 0 || contentWidth <= 0 || scrollRange <= 0) {
    return { thumbW: 0, thumbLeft: 0 };
  }
  const ratio = Math.min(1, Math.max(0, viewportWidth / contentWidth));
  let thumbW = Math.round(trackWidth * ratio);
  thumbW = Math.max(4, Math.min(trackWidth, thumbW));
  let thumbLeft = Math.round((scrollX / scrollRange) * (trackWidth - thumbW));
  if (scrollX <= SCROLL_EPS) thumbLeft = 0;
  if (scrollX >= scrollRange - SCROLL_EPS) thumbLeft = trackWidth - thumbW;
  thumbLeft = Math.max(0, Math.min(thumbLeft, trackWidth - thumbW));
  thumbW = snapToPixelGrid(thumbW);
  thumbLeft = snapToPixelGrid(thumbLeft);
  thumbLeft = Math.max(0, Math.min(thumbLeft, trackWidth - thumbW));
  return { thumbW, thumbLeft };
}

export function AuthenticatedHomeLeftNavStrip({
  colors,
  selectedIndex: selectedIndexProp,
  onSelectIndex,
}: {
  colors: ThemeColors;
  /** Controlled mode: parent owns which tab is highlighted. */
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const splitMetrics = useAuthenticatedHomeSplitLayoutMetrics();
  /**
   * When mounted under {@link AuthenticatedHomeSplitBody}, chrome follows **split column count** (2+ =
   * wide menu with bottom hairline, no extra top margin). Otherwise fall back to window width vs
   * `firstBreakpoint` (e.g. strip reused outside split).
   */
  const chromeFromSplit = splitMetrics !== null;
  /** Same predicate as split body `isWide`: never treat narrow split rows as wide when `rowWidth` lags `windowWidth`. */
  const layoutIsWide = chromeFromSplit
    ? splitMetrics.effectiveSplitWidthPx > AH.firstBreakpoint
    : windowWidth > AH.firstBreakpoint;
  /**
   * Width budget for “labels + horizontal padding + gaps” (see {@link ESTIMATED_NAV_STRIP_CONTENT_W_PX}):
   * full window in single-column, first column width when `columnCount >= 2`. Matches screen vs column
   * minus the two side inset rects ({@link NAV_STRIP_HORIZONTAL_INSET_TOTAL_PX} inside the strip).
   */
  const navStripBudgetWidthPx = chromeFromSplit
    ? Math.round(
        splitMetrics.columnCount >= 2 && splitMetrics.firstColumnWidthPx > 0
          ? splitMetrics.firstColumnWidthPx
          : splitMetrics.effectiveSplitWidthPx,
      )
    : Math.round(windowWidth);
  const stripMarginTop =
    chromeFromSplit && splitMetrics.columnCount >= 2
      ? 0
      : chromeFromSplit
        ? AH.leftNavStripMarginTopPx
        : layoutIsWide
          ? 0
          : AH.leftNavStripMarginTopPx;
  /** Bottom hairline: only after `firstBreakpoint`, and only when the split is actually multi-column. */
  const showBottomMenuRule =
    layoutIsWide && (chromeFromSplit ? splitMetrics.columnCount >= 2 : true);

  const fadeGradientIdRight = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const fadeGradientIdLeft = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = selectedIndexProp !== undefined;
  const activeIndex = isControlled ? (selectedIndexProp as number) : internalIndex;
  const [scrollX, setScrollX] = useState(0);
  const [layoutW, setLayoutW] = useState(0);
  const [contentW, setContentW] = useState(0);
  /** Labels + gaps only (excludes `paddingHorizontal` on the scroll content container). */
  const [intrinsicRowW, setIntrinsicRowW] = useState(0);
  const [outerW, setOuterW] = useState(0);

  const lineT = menuStripRuleThickness();
  /** Edge fades; matches `contentSideInsetPx` (15px) in theme. */
  const fadeW = AH.leftNavStripRightFadeWidthPx;
  const scrollbarGapAboveBorder = AH.leftNavStripScrollbarAboveBorderPx;
  const thumbBottomSnapped = snapToPixelGrid(
    (showBottomMenuRule ? lineT : 0) + scrollbarGapAboveBorder,
  );

  const onOuterLayout = useCallback((e: LayoutChangeEvent) => {
    setOuterW(Math.round(e.nativeEvent.layout.width));
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(e.nativeEvent.contentOffset.x);
  };

  const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setLayoutW((prev) => {
      if (prev !== w) setContentW(0);
      return w;
    });
  }, []);

  const onContentSizeChange = useCallback((w: number, _h: number) => {
    if (!Number.isFinite(w) || w <= 0) return;
    setContentW(Math.round(w));
  }, []);

  const onIntrinsicRowLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setIntrinsicRowW((prev) => (prev === w ? prev : w));
  }, []);

  /**
   * Scroll viewport width: measured `ScrollView` width when available, else budget from split/window
   * so fits/scroll state match the column (wide) or screen (compact) before first layout.
   */
  const scrollViewportW =
    layoutW > 0 ? layoutW : navStripBudgetWidthPx > 0 ? navStripBudgetWidthPx : 0;
  /** Total scroll content width: padding + measured label row (preferred) or `ESTIMATED_NAV_STRIP_CONTENT_W_PX`. */
  const stripContentWidthPx =
    intrinsicRowW > 0
      ? NAV_STRIP_HORIZONTAL_INSET_TOTAL_PX + intrinsicRowW
      : ESTIMATED_NAV_STRIP_CONTENT_W_PX;
  const fits =
    scrollViewportW > 0 && stripContentWidthPx <= scrollViewportW + SCROLL_EPS;
  /** When scrolling, RN may briefly report a low content width; floor with measured or estimated span. */
  const scrollContentSpanPx =
    !fits && scrollViewportW > 0
      ? Math.max(contentW, stripContentWidthPx)
      : 0;

  const scrollRange = Math.max(0, scrollContentSpanPx - scrollViewportW);
  /**
   * Thumb track must match the same client width as `scrollViewportW` so the thumb crosses the full strip.
   * When `outer`/`ScrollView` layouts disagree by a pixel, use the larger width for the track math.
   */
  const scrollTrackWidth = Math.max(
    0,
    outerW > 0 && layoutW > 0
      ? Math.max(outerW, layoutW)
      : outerW > 0
        ? outerW
        : scrollViewportW,
  );
  const showScrollbar =
    !fits && scrollRange > 0 && scrollViewportW > 0 && scrollTrackWidth > 0;
  const { thumbW, thumbLeft } = horizontalThumbFullTrack(
    scrollTrackWidth,
    scrollViewportW,
    scrollContentSpanPx,
    scrollX,
    scrollRange,
  );

  const borderLineStyle = useMemo((): ViewStyle => {
    return {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: lineT,
      backgroundColor: colors.highlight,
      zIndex: 1,
      overflow: "hidden",
    };
  }, [colors.highlight, lineT]);

  const thumbTrackStyle = useMemo((): ViewStyle | null => {
    if (!showScrollbar || thumbW <= 0) return null;
    return {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: thumbBottomSnapped,
      height: lineT,
      minHeight: lineT,
      maxHeight: lineT,
      zIndex: 2,
      overflow: "hidden",
    };
  }, [showScrollbar, thumbW, thumbBottomSnapped, lineT]);

  const thumbFillStyle = useMemo((): ViewStyle | null => {
    if (!showScrollbar || thumbW <= 0) return null;
    return {
      position: "absolute",
      left: snapToPixelGrid(thumbLeft),
      width: Math.max(1, snapToPixelGrid(thumbW)),
      bottom: 0,
      height: lineT,
      backgroundColor: colors.accent,
    };
  }, [showScrollbar, thumbW, thumbLeft, colors.accent, lineT]);

  const labelStyle = (active: boolean) => ({
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: LABEL_FONT_SIZE,
    lineHeight: LABEL_LINE_HEIGHT,
    fontWeight: "400" as const,
    color: active ? colors.primary : colors.secondary,
    includeFontPadding: false,
    paddingVertical: 0,
  });

  /** Avoid flex/layout growing the hairline-high track on web. */
  const lineAxisLock = {
    flexGrow: 0,
    flexShrink: 0,
  } satisfies ViewStyle;

  const navStripLogPrevRef = useRef<{
    windowWidth: number;
    layoutIsWide: boolean;
    navStripBudgetWidthPx: number;
    showBottomMenuRule: boolean;
    stripMarginTop: number;
    fits: boolean;
    layoutW: number;
    scrollViewportW: number;
    contentW: number;
    intrinsicRowW: number;
    stripContentWidthPx: number;
    scrollContentSpanPx: number;
    outerW: number;
    scrollTrackWidth: number;
    showScrollbar: boolean;
    lineT: number;
    thumbBottomSnapped: number;
    splitColumnCount: number | null;
    splitFirstColumnWidthPx: number | null;
    splitRowWidthPx: number | null;
    splitEffectiveWidthPx: number | null;
  } | null>(null);

  useEffect(() => {
    const prev = navStripLogPrevRef.current;
    const splitColumnCount = splitMetrics?.columnCount ?? null;
    const splitFirstColumnWidthPx = splitMetrics?.firstColumnWidthPx ?? null;
    const splitRowWidthPx = splitMetrics?.splitRowWidthPx ?? null;
    const splitEffectiveWidthPx = splitMetrics?.effectiveSplitWidthPx ?? null;
    const next = {
      windowWidth,
      layoutIsWide,
      navStripBudgetWidthPx,
      showBottomMenuRule,
      stripMarginTop,
      fits,
      layoutW,
      scrollViewportW,
      contentW,
      intrinsicRowW,
      stripContentWidthPx,
      scrollContentSpanPx,
      outerW,
      scrollTrackWidth,
      showScrollbar,
      lineT,
      thumbBottomSnapped,
      splitColumnCount,
      splitFirstColumnWidthPx,
      splitRowWidthPx,
      splitEffectiveWidthPx,
    };

    const unchanged =
      prev !== null &&
      prev.windowWidth === next.windowWidth &&
      prev.layoutIsWide === next.layoutIsWide &&
      prev.navStripBudgetWidthPx === next.navStripBudgetWidthPx &&
      prev.showBottomMenuRule === next.showBottomMenuRule &&
      prev.stripMarginTop === next.stripMarginTop &&
      prev.fits === next.fits &&
      prev.layoutW === next.layoutW &&
      prev.scrollViewportW === next.scrollViewportW &&
      prev.contentW === next.contentW &&
      prev.intrinsicRowW === next.intrinsicRowW &&
      prev.stripContentWidthPx === next.stripContentWidthPx &&
      prev.scrollContentSpanPx === next.scrollContentSpanPx &&
      prev.outerW === next.outerW &&
      prev.scrollTrackWidth === next.scrollTrackWidth &&
      prev.showScrollbar === next.showScrollbar &&
      prev.lineT === next.lineT &&
      prev.thumbBottomSnapped === next.thumbBottomSnapped &&
      prev.splitColumnCount === next.splitColumnCount &&
      prev.splitFirstColumnWidthPx === next.splitFirstColumnWidthPx &&
      prev.splitRowWidthPx === next.splitRowWidthPx &&
      prev.splitEffectiveWidthPx === next.splitEffectiveWidthPx;

    if (unchanged) return;
    navStripLogPrevRef.current = next;

    const dpr =
      Platform.OS === "web" && typeof window !== "undefined" && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : PixelRatio.get();

    let bottomRuleEvent: string;
    if (prev === null) {
      bottomRuleEvent = showBottomMenuRule ? "initial_render_visible" : "initial_render_hidden";
    } else if (prev.showBottomMenuRule === showBottomMenuRule) {
      bottomRuleEvent = "unchanged";
    } else {
      bottomRuleEvent = showBottomMenuRule ? "bottom_border_shown" : "bottom_border_hidden";
    }

    let alignmentEvent: string;
    if (prev === null) {
      alignmentEvent = fits ? "initial_align_center" : "initial_align_scroll_start";
    } else if (prev.fits === fits && prev.stripMarginTop === stripMarginTop) {
      alignmentEvent = "strip_alignment_unchanged";
    } else {
      const parts: string[] = [];
      if (prev.fits !== fits) {
        parts.push(fits ? "row_now_centered_fits_viewport" : "row_now_left_when_overflow");
      }
      if (prev.stripMarginTop !== stripMarginTop) {
        parts.push(
          stripMarginTop > 0 ? "strip_margin_top_compact" : "strip_margin_top_wide_zero",
        );
      }
      alignmentEvent = parts.join("|");
    }

    const windowInferredColumns = windowInferredSplitColumnCount(windowWidth);
    const splitWindowColumnCountMismatch =
      chromeFromSplit && splitColumnCount != null && windowInferredColumns !== splitColumnCount;

    logPageDisplay("home_feed_messages_nav_strip", {
      menuId: "feed_messages_tasks_items_coins",
      phase: prev === null ? "mount" : "layout_update",
      chromeRuleSource: chromeFromSplit ? "split_layout_metrics" : "window_width_fallback",
      bottomBorderRule: chromeFromSplit
        ? `effectiveSplitWidthPx>firstBreakpoint && columnCount>=2 (wide=${layoutIsWide}, cols=${splitColumnCount})`
        : `windowWidth>firstBreakpoint (wide=${layoutIsWide})`,
      viewportWidthPx: windowWidth,
      firstBreakpointPx: AH.firstBreakpoint,
      secondBreakpointPx: AH.secondBreakpoint,
      layoutIsWideByEffectiveSplitOrWindow: layoutIsWide,
      navStripBudgetWidthPx,
      stripHorizontalInsetTotalPx: NAV_STRIP_HORIZONTAL_INSET_TOTAL_PX,
      viewportRelationToBreakpoint:
        windowWidth > AH.firstBreakpoint ? "above_wide_threshold" : "at_or_below_compact_threshold",
      windowInferredSplitColumnCount: windowInferredColumns,
      splitLayoutMetricsPresent: chromeFromSplit,
      splitPaneRowWidthPx: splitRowWidthPx,
      splitPaneEffectiveWidthPx: splitEffectiveWidthPx,
      splitPaneFirstColumnWidthPx: splitFirstColumnWidthPx,
      splitColumnCount,
      splitWindowColumnCountMismatch,
      stripMarginTopPx: stripMarginTop,
      leftNavStripMarginTopThemePx: AH.leftNavStripMarginTopPx,
      scrollViewportWidthMeasuredPx: layoutW,
      scrollViewportWidthUsedPx: scrollViewportW,
      scrollViewportWidthPx: scrollViewportW,
      scrollbarTrackWidthPx: scrollTrackWidth,
      estimatedNavStripContentWidthPx: ESTIMATED_NAV_STRIP_CONTENT_W_PX,
      intrinsicLabelRowWidthPx: intrinsicRowW,
      stripContentWidthPx,
      fitsUsesIntrinsicRowMeasure: intrinsicRowW > 0,
      scrollContentWidthRawPx: contentW,
      scrollContentWidthForThumbPx: scrollContentSpanPx,
      scrollOverflowPx: Math.max(0, scrollContentSpanPx - scrollViewportW),
      labelsFitWithoutScroll: fits,
      contentContainerJustifyContent: fits ? "center" : "flex-start",
      contentContainerFlexGrow: fits ? 1 : 0,
      contentContainerMinWidthPx: fits && scrollViewportW > 0 ? scrollViewportW : null,
      outerStripWidthPx: outerW,
      measuredNavOuterMinusSplitFirstColumnPx:
        splitFirstColumnWidthPx != null && outerW > 0 ? outerW - splitFirstColumnWidthPx : null,
      bottomMenuHairlineVisible: showBottomMenuRule,
      bottomRuleThicknessPx: lineT,
      bottomRuleColorRole: "colors.highlight",
      scrollbarTrackVisible: showScrollbar,
      scrollbarThumbBottomOffsetPx: thumbBottomSnapped,
      scrollbarGapAboveBorderThemePx: scrollbarGapAboveBorder,
      platform: Platform.OS,
      devicePixelRatio: dpr,
      alignmentChange: alignmentEvent,
      bottomBorderLifecycle: bottomRuleEvent,
    });
  }, [
    windowWidth,
    layoutIsWide,
    navStripBudgetWidthPx,
    showBottomMenuRule,
    stripMarginTop,
    fits,
    layoutW,
    scrollViewportW,
    contentW,
    intrinsicRowW,
    stripContentWidthPx,
    scrollContentSpanPx,
    outerW,
    scrollTrackWidth,
    showScrollbar,
    lineT,
    thumbBottomSnapped,
    scrollbarGapAboveBorder,
    chromeFromSplit,
    splitMetrics,
  ]);

  return (
    <View
      onLayout={onOuterLayout}
      style={{
        width: "100%",
        alignSelf: "stretch",
        marginTop: stripMarginTop,
        height: STRIP_HEIGHT_PX,
        paddingTop: STRIP_PADDING_PX,
        paddingBottom: STRIP_PADDING_PX,
        marginBottom: 8,
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Full-width scroll + 15px content insets: at scroll 0 / thumb left, row starts 15px in; at max scroll / thumb right, row ends 15px before edge. Edge fades sit on top for motion blur to the real edge. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!fits}
        style={{ width: "100%", height: INNER_SCROLL_HEIGHT_PX, zIndex: 0 }}
        contentContainerStyle={{
          paddingHorizontal: STRIP_PADDING_PX,
          flexGrow: fits ? 1 : 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: fits ? "center" : "flex-start",
          minWidth: fits && scrollViewportW > 0 ? scrollViewportW : undefined,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onScrollViewLayout}
        onContentSizeChange={onContentSizeChange}
      >
        <View
          collapsable={false}
          onLayout={onIntrinsicRowLayout}
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexGrow: 0,
            flexShrink: 0,
          }}
        >
          {NAV_LABELS.map((label, index) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected: index === activeIndex }}
              accessibilityLabel={label}
              onPress={() => {
                if (isControlled) {
                  onSelectIndex?.(index);
                } else {
                  setInternalIndex(index);
                }
              }}
              style={{
                marginRight: index < NAV_LABELS.length - 1 ? ITEM_GAP_PX : 0,
              }}
            >
              <Text style={labelStyle(index === activeIndex)}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {fadeW > 0 ? (
        <>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: STRIP_PADDING_PX,
              width: fadeW,
              height: INNER_SCROLL_HEIGHT_PX,
              zIndex: 2,
            }}
          >
            <Svg width={fadeW} height={INNER_SCROLL_HEIGHT_PX} viewBox={`0 0 ${fadeW} ${INNER_SCROLL_HEIGHT_PX}`}>
              <Defs>
                <SvgLinearGradient id={fadeGradientIdLeft} x1="0%" y1="0" x2="100%" y2="0">
                  <Stop offset="0%" stopColor={colors.background} stopOpacity={1} />
                  <Stop offset="100%" stopColor={colors.background} stopOpacity={0} />
                </SvgLinearGradient>
              </Defs>
              <Rect x={0} y={0} width={fadeW} height={INNER_SCROLL_HEIGHT_PX} fill={`url(#${fadeGradientIdLeft})`} />
            </Svg>
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 0,
              top: STRIP_PADDING_PX,
              width: fadeW,
              height: INNER_SCROLL_HEIGHT_PX,
              zIndex: 2,
            }}
          >
            <Svg width={fadeW} height={INNER_SCROLL_HEIGHT_PX} viewBox={`0 0 ${fadeW} ${INNER_SCROLL_HEIGHT_PX}`}>
              <Defs>
                <SvgLinearGradient id={fadeGradientIdRight} x1="0%" y1="0" x2="100%" y2="0">
                  <Stop offset="0%" stopColor={colors.background} stopOpacity={0} />
                  <Stop offset="100%" stopColor={colors.background} stopOpacity={1} />
                </SvgLinearGradient>
              </Defs>
              <Rect x={0} y={0} width={fadeW} height={INNER_SCROLL_HEIGHT_PX} fill={`url(#${fadeGradientIdRight})`} />
            </Svg>
          </View>
        </>
      ) : null}

      {thumbTrackStyle && thumbFillStyle ? (
        <View pointerEvents="none" style={[thumbTrackStyle, lineAxisLock]}>
          <View pointerEvents="none" collapsable={false} style={[thumbFillStyle, lineAxisLock]} />
        </View>
      ) : null}

      {showBottomMenuRule ? (
        <View pointerEvents="none" collapsable={false} style={[borderLineStyle, lineAxisLock]} />
      ) : null}
    </View>
  );
}
