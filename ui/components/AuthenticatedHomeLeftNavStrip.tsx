import { useCallback, useId, useMemo, useState } from "react";
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
import { layout, type ThemeColors } from "../theme";

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
  /** Match header breakpoint: indent only in compact single-column regime (`viewport <= firstBreakpoint`). */
  const stripMarginTop = windowWidth > AH.firstBreakpoint ? 0 : AH.leftNavStripMarginTopPx;
  /** Bottom hairline under labels appears only above `firstBreakpoint` (narrow = no rule). */
  const showBottomMenuRule = windowWidth > AH.firstBreakpoint;

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
