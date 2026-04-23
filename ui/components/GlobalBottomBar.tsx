import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputSubmitEditingEventData,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { WEB_UI_SANS_STACK } from "../fonts";
import { layout, icons, useColors } from "../theme";
import { useTelegram } from "./Telegram";
import { getBottomBarMetrics } from "./bottomBarMetrics";
import { getPrimaryTextColorFromLaunch } from "./telegramWebApp";

const { maxContentWidth } = layout;
const {
  lineHeight: LINE_HEIGHT,
  horizontalPadding: HORIZONTAL_PADDING,
  maxLinesBeforeScroll: MAX_LINES_BEFORE_SCROLL,
  maxBarHeight: MAX_BAR_HEIGHT,
} = layout.bottomBar;

const FONT_SIZE = 15;
const INNER_PADDING = 20;
const AUTO_SCROLL_THRESHOLD = 30;
const SCROLLBAR_INSET = 5;
const PREMADE_PROMPTS = ["What is the universe?", "Tell me about dogs token"];

// Shared UI primitives used by all platforms.
function SendButton({ color, onPress }: { color: string; onPress: () => void }) {
  return (
    <Pressable
      style={styles.sendWrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Send"
    >
      <Svg width={icons.apply.width} height={icons.apply.height} viewBox="0 0 15 10">
        <Path
          d="M1 5H10M6 1L10 5L6 9"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

function Scrollbar({
  show,
  height,
  indicatorHeight,
  topPosition,
  color,
}: {
  show: boolean;
  height: number;
  indicatorHeight: number;
  topPosition: number;
  color: string;
}) {
  if (!show || indicatorHeight <= 0) return null;
  return (
    <View style={[styles.scrollbarContainer, { height }]}>
      <View
        style={[
          styles.scrollbarIndicator,
          { height: indicatorHeight, marginTop: topPosition, backgroundColor: color },
        ]}
      />
    </View>
  );
}

// Shared entry point: chooses platform-specific implementation and shared colors.
export function GlobalBottomBar() {
  const colors = useColors();
  const { themeBgReady } = useTelegram();
  const backgroundColor = themeBgReady ? colors.background : "transparent";
  const launchPrimary =
    Platform.OS === "web" && typeof window !== "undefined" ? getPrimaryTextColorFromLaunch() : null;
  const inputColor = themeBgReady ? colors.primary : launchPrimary ?? colors.primary;
  const topBorderColor = colors.highlight;

  if (Platform.OS === "web") {
    return (
      <WebBottomBar
        backgroundColor={backgroundColor}
        inputColor={inputColor}
        scrollbarColor={colors.secondary}
        topBorderColor={topBorderColor}
      />
    );
  }

  return (
    <NativeBottomBar
      backgroundColor={backgroundColor}
      inputColor={inputColor}
      scrollbarColor={colors.secondary}
      topBorderColor={topBorderColor}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    position: "relative",
  },
  bottomDivider: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    pointerEvents: "none",
  },
  container: {
    width: "100%",
    maxWidth: maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
  },
  inputWrap: {
    flex: 1,
    position: "relative",
    justifyContent: "flex-start",
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE,
    fontWeight: "400",
    lineHeight: LINE_HEIGHT,
    paddingVertical: INNER_PADDING,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
    minHeight: 0,
    paddingRight: 12,
  },
  nativeInputHost: {
    flexGrow: 1,
    justifyContent: "flex-start",
    position: "relative",
  },
  sendWrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 25,
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

// Platform-specific section: web-only input implementation.
function WebBottomBar({
  backgroundColor,
  inputColor,
  scrollbarColor,
  topBorderColor,
}: {
  backgroundColor: string;
  inputColor: string;
  scrollbarColor: string;
  topBorderColor: string;
}) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [domScrollRange, setDomScrollRange] = useState(0);
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  const [domMirrorHeight, setDomMirrorHeight] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const domMirrorRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomBeforeInputRef = useRef(true);

  const measureAndResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    setContentHeight(el.scrollHeight);
  }, []);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      const range = Math.max(0, target.scrollHeight - target.clientHeight);
      wasNearBottomBeforeInputRef.current =
        range <= 0 || target.scrollTop >= range - AUTO_SCROLL_THRESHOLD;
      setValue(target.value);
      requestAnimationFrame(measureAndResize);
    },
    [measureAndResize],
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onScroll = () => {
      const range = Math.max(0, el.scrollHeight - el.clientHeight);
      wasNearBottomBeforeInputRef.current =
        range <= 0 || el.scrollTop >= range - AUTO_SCROLL_THRESHOLD;
      setScrollY(el.scrollTop);
      setDomScrollRange(range);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [value]);

  useEffect(() => {
    const id = requestAnimationFrame(() => measureAndResize());
    return () => cancelAnimationFrame(id);
  }, [measureAndResize]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let mirror = domMirrorRef.current;
    if (!mirror) {
      mirror = document.createElement("div");
      domMirrorRef.current = mirror;
      mirror.style.position = "absolute";
      mirror.style.visibility = "hidden";
      mirror.style.pointerEvents = "none";
      mirror.style.whiteSpace = "pre-wrap";
      mirror.style.wordBreak = "break-word";
      mirror.style.left = "-9999px";
      mirror.style.top = "-9999px";
      document.body.appendChild(mirror);
    }

    const host = textareaRef.current;
    if (host) {
      const rect = host.getBoundingClientRect();
      const cs = window.getComputedStyle(host);
      mirror.style.width = `${rect.width}px`;
      mirror.style.boxSizing = cs.boxSizing;
      mirror.style.paddingTop = cs.paddingTop;
      mirror.style.paddingBottom = cs.paddingBottom;
      mirror.style.paddingLeft = cs.paddingLeft;
      mirror.style.paddingRight = cs.paddingRight;
      mirror.style.border = cs.border;
      mirror.style.outline = cs.outline;
      mirror.style.fontFamily = cs.fontFamily;
      mirror.style.fontSize = cs.fontSize;
      mirror.style.fontWeight = cs.fontWeight as string;
      mirror.style.lineHeight = cs.lineHeight;
      mirror.style.letterSpacing = cs.letterSpacing;
      mirror.style.textTransform = cs.textTransform;
      mirror.style.direction = cs.direction;
      mirror.style.textAlign = cs.textAlign;
    }

    mirror.textContent = value || " ";
    const h = mirror.getBoundingClientRect().height;
    setDomMirrorHeight(Number.isFinite(h) && h > 0 ? h : null);
  }, [value]);

  const baseHeight = domMirrorHeight ?? contentHeight;
  const metrics = getBottomBarMetrics({
    baseHeight,
    scrollY,
    scrollRangeOverride: domScrollRange,
    lineHeight: LINE_HEIGHT,
    innerPadding: INNER_PADDING,
    maxLinesBeforeScroll: MAX_LINES_BEFORE_SCROLL,
    maxBarHeight: MAX_BAR_HEIGHT,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = textareaRef.current;
    if (!el) return;
    if (
      metrics.rawLines === 7 &&
      metrics.barHeight >= MAX_BAR_HEIGHT &&
      el.scrollTop === 0 &&
      wasNearBottomBeforeInputRef.current
    ) {
      el.scrollTop = INNER_PADDING;
    }
  }, [metrics.rawLines, metrics.barHeight]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = textareaRef.current;
    if (!el || !metrics.showScrollbar || !wasNearBottomBeforeInputRef.current) return;
    const range = el.scrollHeight - el.clientHeight;
    if (range <= 0) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = range;
      setScrollY(range);
      setDomScrollRange(range);
    });
    return () => cancelAnimationFrame(id);
  }, [value, metrics.showScrollbar]);

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    setValue("");
  }, [value]);

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor,
          borderTopWidth: 1,
          borderTopColor: topBorderColor,
          borderBottomWidth: 1,
          borderBottomColor: topBorderColor,
        },
      ]}
    >
      <View style={[styles.container, { backgroundColor }]}>
        <View style={[styles.row, { height: metrics.barHeight }]}>
          <View style={styles.inputWrap}>
            <textarea
              ref={textareaRef}
              data-global-bottom-bar-web
              value={value}
              onInput={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              rows={1}
              style={{
                width: "100%",
                minHeight: metrics.barHeight,
                height: metrics.barHeight,
                maxHeight: metrics.barHeight,
                fontSize: FONT_SIZE,
                lineHeight: `${LINE_HEIGHT}px`,
                paddingTop: INNER_PADDING,
                paddingBottom: INNER_PADDING,
                paddingRight: 36,
                boxSizing: "border-box",
                resize: "none",
                border: "none",
                outline: "none",
                color: inputColor,
                backgroundColor: "transparent",
                caretColor: inputColor,
                ["--ai-placeholder-color" as string]: inputColor,
                fontFamily: WEB_UI_SANS_STACK,
                fontWeight: 400,
                overflow:
                  metrics.contentHeightWithGaps > metrics.viewportHeight ? "auto" : "hidden",
              }}
              placeholder={isFocused ? "" : "AI and search"}
            />
          </View>
          <SendButton color={inputColor} onPress={handleSend} />
        </View>
      </View>
      <Scrollbar
        show={metrics.showScrollbar}
        height={metrics.barHeight}
        indicatorHeight={metrics.scrollbar.indicatorHeight}
        topPosition={metrics.scrollbar.topPosition}
        color={scrollbarColor}
      />
      <View style={[styles.bottomDivider, { backgroundColor: topBorderColor }]} />
    </View>
  );
}

// Platform-specific section: native (iOS/Android) input implementation.
function NativeBottomBar({
  backgroundColor,
  inputColor,
  scrollbarColor,
  topBorderColor,
}: {
  backgroundColor: string;
  inputColor: string;
  scrollbarColor: string;
  topBorderColor: string;
}) {
  const router = useRouter();
  const { triggerHaptic } = useTelegram();
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>(LINE_HEIGHT);
  const [mirrorHeight, setMirrorHeight] = useState<number | null>(null);
  const [inputAreaWidth, setInputAreaWidth] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const contentHeightWithGapsRef = useRef(LINE_HEIGHT + INNER_PADDING * 2);
  const wasNearBottomBeforeResizeRef = useRef(true);

  const submit = useCallback(() => {
    triggerHaptic("heavy");
    let text = value.trim();
    if (!text && PREMADE_PROMPTS.length > 0) {
      text = PREMADE_PROMPTS[Math.floor(Math.random() * PREMADE_PROMPTS.length)] ?? "";
      setValue(text);
    }
    if (!text) return;
    Keyboard.dismiss();
    setValue("");
    router.push({ pathname: "/ai" as any, params: { prompt: text } });
  }, [router, triggerHaptic, value]);

  const onContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const h = e.nativeEvent.contentSize.height;
      if (Number.isFinite(h)) setContentHeight(h);
    },
    [],
  );

  const onSubmitEditing = useCallback(
    (_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      submit();
    },
    [submit],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;
    setScrollY(y);
  }, []);

  const baseHeight = mirrorHeight != null ? mirrorHeight : contentHeight + INNER_PADDING * 2;
  const metrics = getBottomBarMetrics({
    baseHeight,
    scrollY,
    lineHeight: LINE_HEIGHT,
    innerPadding: INNER_PADDING,
    maxLinesBeforeScroll: MAX_LINES_BEFORE_SCROLL,
    maxBarHeight: MAX_BAR_HEIGHT,
  });

  useEffect(() => {
    if (
      metrics.rawLines === 7 &&
      metrics.barHeight >= MAX_BAR_HEIGHT &&
      scrollY === 0 &&
      wasNearBottomBeforeResizeRef.current
    ) {
      scrollRef.current?.scrollTo({ y: INNER_PADDING, animated: false });
    }
  }, [metrics.rawLines, metrics.barHeight, scrollY]);

  const onScrollViewContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const previousRange = Math.max(contentHeightWithGapsRef.current - metrics.viewportHeight, 0);
      const nearBottom =
        previousRange <= 0 || scrollYRef.current >= previousRange - AUTO_SCROLL_THRESHOLD;
      wasNearBottomBeforeResizeRef.current = nearBottom;
      contentHeightWithGapsRef.current = h;

      if (h > metrics.viewportHeight && nearBottom) {
        scrollRef.current?.scrollToEnd({ animated: false });
      }
    },
    [metrics.viewportHeight],
  );

  return (
    <View
      style={[
        styles.wrapper,
        {
          height: metrics.barHeight,
          backgroundColor,
          borderTopWidth: 1,
          borderTopColor: topBorderColor,
          borderBottomWidth: 1,
          borderBottomColor: topBorderColor,
        },
      ]}
    >
      <View style={[styles.container, { height: metrics.barHeight, backgroundColor }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={{ height: metrics.viewportHeight, justifyContent: "flex-start" }}>
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingRight: 6, flexGrow: 1, justifyContent: "flex-start" }}
                onScroll={onScroll}
                onContentSizeChange={onScrollViewContentSizeChange}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={styles.nativeInputHost}
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    if (Number.isFinite(w) && w > 0) setInputAreaWidth(w);
                  }}
                >
                  <TextInput
                    style={[styles.input, { color: inputColor }]}
                    placeholder={isFocused ? "" : "AI & Search"}
                    placeholderTextColor={inputColor}
                    value={value}
                    onChangeText={setValue}
                    onSubmitEditing={onSubmitEditing}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    multiline
                    maxLength={4096}
                    onContentSizeChange={onContentSizeChange}
                    scrollEnabled={false}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                  />
                  <Text
                    style={[
                      styles.input,
                      {
                        position: "absolute",
                        opacity: 0,
                        pointerEvents: "none",
                        left: 0,
                        right: 0,
                        paddingVertical: INNER_PADDING,
                        ...(inputAreaWidth != null ? { width: inputAreaWidth } : {}),
                      },
                    ]}
                    numberOfLines={0}
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (Number.isFinite(h) && h > 0) setMirrorHeight(h);
                    }}
                  >
                    {value || " "}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
          <SendButton color={inputColor} onPress={submit} />
        </View>
      </View>
      <Scrollbar
        show={metrics.showScrollbar}
        height={metrics.barHeight}
        indicatorHeight={metrics.scrollbar.indicatorHeight}
        topPosition={metrics.scrollbar.topPosition}
        color={scrollbarColor}
      />
      <View style={[styles.bottomDivider, { backgroundColor: topBorderColor }]} />
    </View>
  );
}

