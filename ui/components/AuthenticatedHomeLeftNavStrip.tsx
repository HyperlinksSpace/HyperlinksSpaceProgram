import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../fonts";
import { layout, type ThemeColors } from "../theme";

const NAV_LABELS = ["Feed", "Messages", "Tasks", "Items", "Coins"] as const;

/** Total strip height including 15px inner padding on all sides. */
const STRIP_HEIGHT_PX = 55;
const STRIP_PADDING_PX = layout.contentSideInsetPx;
const INNER_SCROLL_HEIGHT_PX = STRIP_HEIGHT_PX - STRIP_PADDING_PX * 2;
const ITEM_GAP_PX = layout.contentSideInsetPx;
const LABEL_FONT_SIZE = 20;
const LABEL_LINE_HEIGHT = 15;
const SCROLL_EPS = 2;

function horizontalScrollbarThumb(
  trackWidth: number,
  viewportWidth: number,
  contentWidth: number,
  scrollX: number,
  scrollRange: number,
): { thumbW: number; thumbLeft: number } {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0 || contentWidth <= 0 || scrollRange <= 0) {
    return { thumbW: 0, thumbLeft: 0 };
  }
  const thumbWidthRatio = Math.min(1, Math.max(0, viewportWidth / contentWidth));
  const thumbW = Math.min(trackWidth, Math.max(0, trackWidth * thumbWidthRatio));
  const scrollPosition = Math.min(1, Math.max(0, scrollX / scrollRange));
  const availableSpace = Math.min(trackWidth, Math.max(0, trackWidth - thumbW));
  const thumbLeft = Math.min(trackWidth, Math.max(0, scrollPosition * availableSpace));
  return { thumbW, thumbLeft };
}

export function AuthenticatedHomeLeftNavStrip({ colors }: { colors: ThemeColors }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [layoutW, setLayoutW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const [bleed, setBleed] = useState({
    left: 0,
    width: Dimensions.get("window").width,
  });
  const outerRef = useRef<View>(null);

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
    (_e: LayoutChangeEvent) => {
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
  }, [syncBleed, layoutW, windowWidth]);

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
  const showScrollbar = !fits && scrollRange > 0 && layoutW > 0;
  const trackWidth = Math.max(0, layoutW - 2 * ITEM_GAP_PX);
  const { thumbW, thumbLeft } = horizontalScrollbarThumb(
    trackWidth,
    layoutW,
    contentW,
    scrollX,
    scrollRange,
  );

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
        paddingHorizontal: STRIP_PADDING_PX,
        paddingVertical: STRIP_PADDING_PX,
        marginBottom: 8,
        position: "relative",
        overflow: "visible",
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!fits}
        style={{ height: INNER_SCROLL_HEIGHT_PX }}
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

      {showScrollbar && thumbW > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: STRIP_PADDING_PX,
            right: STRIP_PADDING_PX,
            bottom: 2,
            height: 1,
          }}
        >
          <View style={{ height: 1, width: "100%", position: "relative" }}>
            <View
              style={{
                position: "absolute",
                left: thumbLeft,
                width: thumbW,
                height: 1,
                backgroundColor: colors.highlight,
              }}
            />
          </View>
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: bleed.left,
          width: bleed.width,
          bottom: 0,
          height: 1,
          backgroundColor: colors.highlight,
        }}
      />
    </View>
  );
}
