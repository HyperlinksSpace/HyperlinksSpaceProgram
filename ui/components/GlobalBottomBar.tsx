/**
 * Global AI & Search bar (bottom block).
 *
 * This mirrors the Flutter GlobalBottomBar behaviour:
 * - 20px line height, 20px top/bottom padding
 * - Bar grows from 1–7 lines, then caps at 180px and enables internal scroll
 * - Last line stays pinned 20px from the bottom while typing
 * - Apply icon is always 25px from the bottom
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  ScrollView,
  Platform,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
  type TextInputContentSizeChangeEventData,
  type NativeScrollEvent,
  type NativeSyntheticEvent as RnNativeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { useTelegram } from "./Telegram";
import Svg, { Path } from "react-native-svg";
import { layout, icons, useColors } from "../theme";

const { maxContentWidth } = layout;
const {
  barMinHeight: BAR_MIN_HEIGHT,
  horizontalPadding: HORIZONTAL_PADDING,
  verticalPadding: VERTICAL_PADDING,
  applyIconBottom: APPLY_ICON_BOTTOM,
  lineHeight: LINE_HEIGHT,
  maxLinesBeforeScroll: MAX_LINES_BEFORE_SCROLL,
  maxBarHeight: MAX_BAR_HEIGHT,
} = layout.bottomBar;
const FONT_SIZE = 15;
// Same as web: 20px gap above first line and below last line inside the input.
const INNER_PADDING = 20;
const AUTO_SCROLL_THRESHOLD = 30;
const PREMADE_PROMPTS = [
  "What is the universe?",
  "Tell me about dogs token",
];

export function GlobalBottomBar() {
  const router = useRouter();
  const { triggerHaptic, themeBgReady } = useTelegram();
  const colors = useColors();
  const backgroundColor = themeBgReady ? colors.background : "transparent";
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [contentHeight, setContentHeight] = useState<number>(LINE_HEIGHT);
  // Height of a hidden mirrored Text used for shrink (web) and grow (native when contentSize is unreliable).
  const [mirrorHeight, setMirrorHeight] = useState<number | null>(null);
  // Width of the input area so the mirror Text can wrap correctly on native (iOS/Android).
  const [inputAreaWidth, setInputAreaWidth] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const scrollYRef = useRef(0);
  const contentHeightWithGapsRef = useRef(LINE_HEIGHT + INNER_PADDING * 2);
  const wasNearBottomBeforeResizeRef = useRef(true);

  const isTelegramIOSWeb =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    !!(window as any).Telegram?.WebApp &&
    (window as any).Telegram.WebApp.platform === "ios";

  // Web-only: wire up a native scroll listener on the underlying textarea
  // rendered by TextInput so we can track manual scroll that React Native Web
  // may not surface via onScroll.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof document === "undefined") return;

    const el = document.querySelector(
      '[data-ai-input="true"]',
    ) as HTMLElement | null;
    if (!el) return;

    const handleScroll = () => {
      const scrollTop = (el as HTMLTextAreaElement).scrollTop;
      if (typeof scrollTop !== "number") return;
      setScrollY(scrollTop);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const submit = useCallback(() => {
    triggerHaptic("heavy");
    let text = value.trim();
    if (!text && PREMADE_PROMPTS.length > 0) {
      text =
        PREMADE_PROMPTS[
          Math.floor(Math.random() * PREMADE_PROMPTS.length)
        ] ?? "";
      setValue(text);
    }
    if (!text) return;
    Keyboard.dismiss();
    setValue("");
    router.push({ pathname: "/ai" as any, params: { prompt: text } });
  }, [value, router, triggerHaptic]);

  const onSubmitEditing = useCallback(
    (_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      submit();
    },
    [submit]
  );

  const onContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const h = e.nativeEvent.contentSize.height;
      if (!Number.isFinite(h)) return;
      setContentHeight(h);
    },
    []
  );

  const onChangeText = useCallback((text: string) => {
    setValue(text);
  }, []);

  const onScroll = useCallback(
    (e: RnNativeEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      setScrollY(y);
    },
    [],
  );

  // Same formula as GlobalBottomBarWeb: base height includes 20px top + bottom gaps.
  // Mirror is given paddingVertical so mirrorHeight = content with gaps; else contentHeight is text-only from onContentSizeChange.
  const baseHeight =
    mirrorHeight != null
      ? mirrorHeight
      : contentHeight + INNER_PADDING * 2;
  const effectiveTextHeight = Math.max(0, baseHeight - INNER_PADDING * 2);
  const rawLines = Math.max(
    1,
    Math.floor(
      (effectiveTextHeight + LINE_HEIGHT * 0.2) / LINE_HEIGHT,
    ),
  );
  const visibleLines = Math.min(rawLines, MAX_LINES_BEFORE_SCROLL);
  const dynamicHeight = Math.max(
    60,
    Math.min(
      MAX_BAR_HEIGHT,
      INNER_PADDING * 2 + visibleLines * LINE_HEIGHT,
    ),
  );

  const barHeight = dynamicHeight;
  const viewportHeight = barHeight;
  const contentHeightWithGaps = baseHeight;
  const scrollRange = Math.max(contentHeightWithGaps - viewportHeight, 0);
  const isScrollMode =
    contentHeightWithGaps > viewportHeight && scrollRange > 0;
  const showScrollbar = isScrollMode;

  let indicatorHeight = 0;
  let topPosition = 0;
  if (
    showScrollbar &&
    scrollRange > 0 &&
    contentHeightWithGaps > 0 &&
    barHeight != null
  ) {
    const indicatorHeightRatio = Math.min(
      1,
      Math.max(0, viewportHeight / contentHeightWithGaps),
    );
    indicatorHeight = Math.min(
      barHeight,
      Math.max(0, barHeight * indicatorHeightRatio),
    );
    const scrollPosition = Math.min(1, Math.max(0, scrollY / scrollRange));
    const availableSpace = Math.min(
      barHeight,
      Math.max(0, barHeight - indicatorHeight),
    );
    topPosition = Math.min(
      barHeight,
      Math.max(0, scrollPosition * availableSpace),
    );
  }

  // When the 7th line first appears (max bar height, no scroll yet), shift
  // content up by one inner padding so the last visible line aligns with the arrow (same as web).
  useEffect(() => {
    if (
      rawLines === 7 &&
      dynamicHeight >= MAX_BAR_HEIGHT &&
      scrollY === 0 &&
      wasNearBottomBeforeResizeRef.current
    ) {
      scrollRef.current?.scrollTo({ y: INNER_PADDING, animated: false });
    }
  }, [rawLines, dynamicHeight, scrollY]);

  // Snap the ScrollView to bottom whenever the content becomes taller than
  // the visible viewport. Using onContentSizeChange ensures the scroll
  // happens after iOS has laid out the content, so scrollToEnd is effective.
  const onScrollViewContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const previousScrollRange = Math.max(
        contentHeightWithGapsRef.current - viewportHeight,
        0,
      );
      const isNearBottomBeforeResize =
        previousScrollRange <= 0 ||
        scrollYRef.current >= previousScrollRange - AUTO_SCROLL_THRESHOLD;
      wasNearBottomBeforeResizeRef.current = isNearBottomBeforeResize;
      contentHeightWithGapsRef.current = h;

      if (h > viewportHeight && scrollRef.current && isNearBottomBeforeResize) {
        scrollRef.current.scrollToEnd({ animated: false });
      }
    },
    [viewportHeight],
  );

  return (
    <View style={[styles.wrapper, { height: barHeight, backgroundColor }]}>
      <View style={[styles.container, { height: barHeight, backgroundColor }]}>
        <View style={styles.inner}>
          <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <View
              style={{
                height: viewportHeight,
                justifyContent: "flex-start",
              }}
            >
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingRight: 6,
                  flexGrow: 1,
                  justifyContent: "flex-start",
                }}
                onScroll={onScroll}
                onContentSizeChange={onScrollViewContentSizeChange}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={{
                    flexGrow: 1,
                    justifyContent: "flex-start",
                    position: "relative",
                  }}
                  onLayout={
                    Platform.OS !== "web"
                      ? (e) => {
                          const w = e.nativeEvent.layout.width;
                          if (Number.isFinite(w) && w > 0) setInputAreaWidth(w);
                        }
                      : undefined
                  }
                >
                  <TextInput
                    ref={inputRef}
                    style={[styles.input, styles.inputWeb, { color: colors.primary }]}
                    placeholder={isFocused ? "" : "AI & Search"}
                    placeholderTextColor={colors.primary}
                    value={value}
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmitEditing}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    multiline
                    maxLength={4096}
                    onContentSizeChange={onContentSizeChange}
                    scrollEnabled={false}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    // @ts-expect-error dataSet is a valid prop on web (used for CSS targeting)
                    dataSet={{ "ai-input": "true" }}
                  />
                  {Platform.OS === "web" && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        right: 0,
                        // Wider gutter on Telegram iOS webview so the
                        // native blue scroll thumb (if drawn) sits well
                        // away from the caret and last characters.
                        width: isTelegramIOSWeb ? 24 : 12,
                        backgroundColor,
                      }}
                    />
                  )}
                  <Text
                    style={[
                      styles.input,
                      styles.inputWeb,
                      {
                        position: "absolute",
                        opacity: 0,
                        pointerEvents: "none",
                        left: 0,
                        right: 0,
                        paddingVertical: INNER_PADDING,
                        // On native, give mirror explicit width so it wraps like the input and reports correct height.
                        ...(Platform.OS !== "web" &&
                          inputAreaWidth != null && { width: inputAreaWidth }),
                      },
                    ]}
                    numberOfLines={0}
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (Number.isFinite(h) && h > 0) {
                        setMirrorHeight(h);
                      }
                    }}
                  >
                    {value || " "}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
          <Pressable
            style={styles.applyWrap}
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Svg
              width={icons.apply.width}
              height={icons.apply.height}
              viewBox="0 0 15 10"
            >
              <Path
                d="M1 5H10M6 1L10 5L6 9"
                stroke={colors.primary}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>
      </View>
      </View>
      {showScrollbar && indicatorHeight > 0 && (
        <View style={[styles.scrollbarContainer, { height: barHeight }]}>
          <View
            style={[
              styles.scrollbarIndicator,
              {
                height: indicatorHeight,
                marginTop: topPosition,
                backgroundColor: colors.secondary,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const SCROLLBAR_INSET = 5;

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    position: "relative",
  },
  container: {
    width: "100%",
    maxWidth: maxContentWidth,
    alignSelf: "center",
    // backgroundColor is applied dynamically via useColors()
    paddingVertical: 0,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  inner: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE,
    color: "#000000",
    lineHeight: LINE_HEIGHT,
    paddingVertical: INNER_PADDING,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  // Baseline overrides: relax RN Web default minHeight (40) and rely on our
  // dynamic height logic (inputDynamicStyle) instead.
  inputWeb: {
    minHeight: 0,
    // Base gutter so the caret and last characters never sit directly in the
    // system scrollbar lane. On Telegram iOS we add extra right padding at
    // runtime via the overlay width (see isTelegramIOSWeb logic).
    paddingRight: 12,
  },
  applyWrap: {
    // 25px padding from the bottom edge of the bar.
    paddingBottom: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  applyIcon: {
    width: 15,
    height: 10,
    backgroundColor: "#1a1a1a",
    borderRadius: 1,
  },
  scrollbarContainer: {
    position: "absolute",
    right: SCROLLBAR_INSET,
    top: 0,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  scrollbarIndicator: {
    width: 1,
  },
});
