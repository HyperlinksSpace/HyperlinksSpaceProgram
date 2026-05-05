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
  const stripMarginTop =
    chromeFromSplit && splitMetrics.columnCount >= 2
      ? 0
      : chromeFromSplit
        ? AH.leftNavStripMarginTopPx
        : windowWidth > AH.firstBreakpoint
          ? 0
          : AH.leftNavStripMarginTopPx;
  /** Bottom hairline: multi-column split only; single-column compact has no rule under labels. */
  const showBottomMenuRule = chromeFromSplit
    ? splitMetrics.columnCount >= 2
    : windowWidth > AH.firstBreakpoint;

  const fadeGradientIdRight = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const fadeGradientIdLeft = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = selectedIndexProp !== undefined;
  const activeIndex = isControlled ? (selectedIndexProp as number) : internalIndex;
  const [scrollX, setScrollX] = useState(0);
  const [layoutW, setLayoutW] = useState(0);
  const [contentW, setContentW] = useState(0);
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

  const onScrollViewLayout = (e: LayoutChangeEvent) => {
    setLayoutW(Math.round(e.nativeEvent.layout.width));
  };

  const onContentSizeChange = (w: number, _h: number) => {
    if (Number.isFinite(w) && w > 0) setContentW(Math.round(w));
  };

  const scrollRange = Math.max(0, contentW - layoutW);
  const fits = contentW > 0 && layoutW > 0 && contentW <= layoutW + SCROLL_EPS;
  const scrollTrackWidth = Math.max(0, outerW);
  const showScrollbar = !fits && scrollRange > 0 && layoutW > 0 && scrollTrackWidth > 0;
  const { thumbW, thumbLeft } = horizontalThumbFullTrack(
    scrollTrackWidth,
    layoutW,
    contentW,
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
      backgroundColor: colors.highlight,
    };
  }, [showScrollbar, thumbW, thumbLeft, colors.highlight, lineT]);

  const labelStyle = (active: boolean) => ({
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: LABEL_FONT_SIZE,
    lineHeight: LABEL_LINE_HEIGHT,
    fontWeight: "400" as const,
    color: active ? colors.primary : colors.highlight,
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
    showBottomMenuRule: boolean;
    stripMarginTop: number;
    fits: boolean;
    layoutW: number;
    contentW: number;
    outerW: number;
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
      showBottomMenuRule,
      stripMarginTop,
      fits,
      layoutW,
      contentW,
      outerW,
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
      prev.showBottomMenuRule === next.showBottomMenuRule &&
      prev.stripMarginTop === next.stripMarginTop &&
      prev.fits === next.fits &&
      prev.layoutW === next.layoutW &&
      prev.contentW === next.contentW &&
      prev.outerW === next.outerW &&
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
      bottomBorderRule:
        chromeFromSplit && splitColumnCount != null
          ? `split_column_count>=2 (${splitColumnCount})`
          : "window_width>firstBreakpoint",
      viewportWidthPx: windowWidth,
      firstBreakpointPx: AH.firstBreakpoint,
      secondBreakpointPx: AH.secondBreakpoint,
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
      scrollViewportWidthPx: layoutW,
      scrollContentWidthPx: contentW,
      scrollOverflowPx: Math.max(0, contentW - layoutW),
      labelsFitWithoutScroll: fits,
      contentContainerJustifyContent: fits ? "center" : "flex-start",
      contentContainerFlexGrow: fits ? 1 : 0,
      contentContainerMinWidthPx: fits && layoutW > 0 ? layoutW : null,
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
    showBottomMenuRule,
    stripMarginTop,
    fits,
    layoutW,
    contentW,
    outerW,
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
          minWidth: fits && layoutW > 0 ? layoutW : undefined,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onScrollViewLayout}
        onContentSizeChange={onContentSizeChange}
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
