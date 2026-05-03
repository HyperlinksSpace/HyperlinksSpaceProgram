import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Dimensions,
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

/** Total strip height including inner padding. */
const STRIP_HEIGHT_PX = 55;
const STRIP_PADDING_PX = layout.contentSideInsetPx;
const INNER_SCROLL_HEIGHT_PX = STRIP_HEIGHT_PX - STRIP_PADDING_PX * 2;
const ITEM_GAP_PX = layout.contentSideInsetPx;
const LABEL_FONT_SIZE = 20;
const LABEL_LINE_HEIGHT = 15;
const SCROLL_EPS = 2;
const BORDER_PX = 1;

function snapLayoutPx(n: number): number {
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
  return { thumbW, thumbLeft };
}

export function AuthenticatedHomeLeftNavStrip({ colors }: { colors: ThemeColors }) {
  const fadeGradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [layoutW, setLayoutW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [outerW, setOuterW] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const [bleed, setBleed] = useState({
    left: 0,
    width: Dimensions.get("window").width,
  });
  const outerRef = useRef<View>(null);

  const fadeW = AH.leftNavStripRightFadeWidthPx;
  const scrollbarGapAboveBorder = AH.leftNavStripScrollbarAboveBorderPx;
  const thumbBottomPx = BORDER_PX + scrollbarGapAboveBorder;

  const syncBleed = useCallback(() => {
    const node = outerRef.current;
    const winW =
      Platform.OS === "web" && typeof window !== "undefined" ? window.innerWidth : Dimensions.get("window").width;
    if (!node?.measureInWindow) {
      setBleed((b) => (b.width !== winW ? { ...b, width: winW } : b));
      return;
    }
    node.measureInWindow((x, _y, _w, _h) => {
      setBleed({ left: -x, width: winW });
    });
  }, []);

  const onOuterLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setOuterW(Math.round(e.nativeEvent.layout.width));
      syncBleed();
    },
    [syncBleed],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onResize = () => syncBleed();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncBleed]);

  useEffect(() => {
    const t = requestAnimationFrame(() => syncBleed());
    return () => cancelAnimationFrame(t);
  }, [syncBleed, layoutW, windowWidth, outerW]);

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
  const trackWidth = Math.max(0, outerW);
  const showScrollbar = !fits && scrollRange > 0 && layoutW > 0 && trackWidth > 0;
  const { thumbW, thumbLeft } = horizontalThumbFullTrack(
    trackWidth,
    layoutW,
    contentW,
    scrollX,
    scrollRange,
  );

  const borderLineStyle = useMemo((): ViewStyle => {
    const left = snapLayoutPx(bleed.left);
    const width = Math.max(1, snapLayoutPx(bleed.width));
    return {
      position: "absolute",
      left,
      width,
      bottom: 0,
      height: BORDER_PX,
      backgroundColor: colors.highlight,
      zIndex: 1,
    };
  }, [bleed.left, bleed.width, colors.highlight]);

  const thumbLineStyle = useMemo((): ViewStyle | null => {
    if (!showScrollbar || thumbW <= 0) return null;
    return {
      position: "absolute",
      left: thumbLeft,
      width: Math.max(1, thumbW),
      height: BORDER_PX,
      bottom: thumbBottomPx,
      backgroundColor: colors.highlight,
      zIndex: 2,
    };
  }, [showScrollbar, thumbW, thumbLeft, thumbBottomPx, colors.highlight]);

  const labelStyle = (active: boolean) => ({
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: LABEL_FONT_SIZE,
    lineHeight: LABEL_LINE_HEIGHT,
    fontWeight: "400" as const,
    color: active ? colors.primary : colors.highlight,
    includeFontPadding: false,
    paddingVertical: 0,
  });

  return (
    <View
      ref={outerRef}
      onLayout={onOuterLayout}
      style={{
        width: "100%",
        alignSelf: "stretch",
        height: STRIP_HEIGHT_PX,
        paddingLeft: STRIP_PADDING_PX,
        paddingRight: 0,
        paddingTop: STRIP_PADDING_PX,
        paddingBottom: STRIP_PADDING_PX,
        marginBottom: 8,
        position: "relative",
        overflow: "visible",
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!fits}
        style={{ height: INNER_SCROLL_HEIGHT_PX, zIndex: 0 }}
        contentContainerStyle={{
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
              setActiveIndex(index);
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
              <SvgLinearGradient id={fadeGradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
                <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
              </SvgLinearGradient>
            </Defs>
            <Rect x={0} y={0} width={fadeW} height={INNER_SCROLL_HEIGHT_PX} fill={`url(#${fadeGradientId})`} />
          </Svg>
        </View>
      ) : null}

      {thumbLineStyle ? <View pointerEvents="none" style={thumbLineStyle} /> : null}

      <View pointerEvents="none" style={borderLineStyle} />
    </View>
  );
}
