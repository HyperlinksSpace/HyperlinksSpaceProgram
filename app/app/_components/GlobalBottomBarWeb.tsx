/**
 * Web-only GlobalBottomBar implementation using a native <textarea>.
 * Mirrors GlobalBottomBar behaviour (auto-resize 1–8 lines, custom scroll
 * indicator, arrow icon) so we can compare web rendering more directly.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, layout, icons } from "../theme";

const { maxContentWidth } = layout;
const {
  lineHeight: LINE_HEIGHT,
  verticalPadding: VERTICAL_PADDING,
  horizontalPadding: HORIZONTAL_PADDING,
  applyIconBottom: APPLY_ICON_BOTTOM,
  maxLinesBeforeScroll: MAX_LINES_BEFORE_SCROLL,
  maxBarHeight: MAX_BAR_HEIGHT,
} = layout.bottomBar;
const INNER_PADDING = 20; // gap above first line and below last line
const AUTO_SCROLL_THRESHOLD = 30;
const MAX_INPUT_HEIGHT = (MAX_LINES_BEFORE_SCROLL + 1) * LINE_HEIGHT; // 8 lines = 160 (text-only height)

export function GlobalBottomBarWeb() {
  const [value, setValue] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const [domScrollRange, setDomScrollRange] = useState(0);
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  // Height of a DOM-based mirror used to drive both growth and shrink on web.
  const [domMirrorHeight, setDomMirrorHeight] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const domMirrorRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomBeforeInputRef = useRef(true);

  // Hide native scrollbar for the textarea (same as we try for the main bar).
  useEffect(() => {
    const styleId = "global-bottom-bar-web-style";
    if (typeof document === "undefined" || document.getElementById(styleId)) return;
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = `
      [data-global-bottom-bar-web] {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      [data-global-bottom-bar-web]::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
      [data-global-bottom-bar-web]::placeholder {
        color: ${colors.text};
        opacity: 1;
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);

  const measureAndResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Let React control the height via dynamicHeight; we only measure the
    // intrinsic content height (including inner padding).
    el.style.height = "auto";
    const fullScrollHeight = el.scrollHeight;
    setContentHeight(fullScrollHeight);
  }, []);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      const range = Math.max(0, target.scrollHeight - target.clientHeight);
      const isNearBottom =
        range <= 0 || target.scrollTop >= range - AUTO_SCROLL_THRESHOLD;
      wasNearBottomBeforeInputRef.current = isNearBottom;
      setValue(target.value);
      requestAnimationFrame(measureAndResize);
    },
    [measureAndResize]
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onScroll = () => {
      const scrollTop = el.scrollTop;
      const contentH = el.scrollHeight;
      const clientH = el.clientHeight;
      const range = Math.max(0, contentH - clientH);
      wasNearBottomBeforeInputRef.current =
        range <= 0 || scrollTop >= range - AUTO_SCROLL_THRESHOLD;
      setScrollY(scrollTop);
      setDomScrollRange(range);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [value]);

  useEffect(() => {
    const id = requestAnimationFrame(() => measureAndResize());
    return () => cancelAnimationFrame(id);
  }, [measureAndResize]);

  // Web-only DOM mirror: measure real wrapped text height (including INNER_PADDING),
  // using a pixel-identical clone of the textarea's computed styles.
  useEffect(() => {
    if (typeof document === "undefined") return;

    let el = domMirrorRef.current;
    if (!el) {
      el = document.createElement("div");
      domMirrorRef.current = el;
      el.style.position = "absolute";
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
      el.style.whiteSpace = "pre-wrap";
      el.style.wordBreak = "break-word";
      el.style.left = "-9999px";
      el.style.top = "-9999px";
      document.body.appendChild(el);
    }

    const host = textareaRef.current;
    if (host) {
      const rect = host.getBoundingClientRect();
      const cs = window.getComputedStyle(host);

      // Match width and all layout‑critical styles.
      el.style.width = `${rect.width}px`;
      el.style.boxSizing = cs.boxSizing;
      el.style.paddingTop = cs.paddingTop;
      el.style.paddingBottom = cs.paddingBottom;
      el.style.paddingLeft = cs.paddingLeft;
      el.style.paddingRight = cs.paddingRight;
      el.style.border = cs.border;
      el.style.outline = cs.outline;
      el.style.fontFamily = cs.fontFamily;
      el.style.fontSize = cs.fontSize;
      el.style.fontWeight = cs.fontWeight as string;
      el.style.lineHeight = cs.lineHeight;
      el.style.letterSpacing = cs.letterSpacing;
      el.style.textTransform = cs.textTransform;
      el.style.direction = cs.direction;
      el.style.textAlign = cs.textAlign;
    }

    el.textContent = value || " ";
    const h = el.getBoundingClientRect().height;
    setDomMirrorHeight(Number.isFinite(h) && h > 0 ? h : null);
  }, [value]);

  // Intrinsic text height (without inner gaps). Prefer the DOM mirror
  // measurement when available so shrink-on-erase works reliably.
  const baseHeight =
    domMirrorHeight != null ? domMirrorHeight : contentHeight;
  const effectiveTextHeight = Math.max(0, baseHeight - INNER_PADDING * 2);
  // Use a threshold so we only switch to the next line once most of the
  // next 20px slot is actually used (avoids early jumps on a few pixels).
  const rawLines = Math.max(
    1,
    Math.floor((effectiveTextHeight + LINE_HEIGHT * 0.2) / LINE_HEIGHT),
  );
  // Visually we allow up to 7 full lines; the 8th+ line uses scroll.
  const visibleLines = Math.min(rawLines, MAX_LINES_BEFORE_SCROLL);
  // Final height: 2 * INNER_PADDING for gaps + visibleLines * lineHeight,
  // clamped between 60 and 180px.
  const dynamicHeight = Math.max(
    60,
    Math.min(
      MAX_BAR_HEIGHT,
      INNER_PADDING * 2 + visibleLines * LINE_HEIGHT,
    ),
  );
  const rowHeight = dynamicHeight;
  const viewportHeight = rowHeight;
  // Use height that includes 20px top + bottom gaps for scroll math (same as dynamicHeight formula).
  const contentHeightWithGaps = baseHeight;
  const scrollRange = Math.max(contentHeightWithGaps - viewportHeight, 0);
  // Enter scroll mode as soon as content is taller than the visible viewport (i.e. from the 8th line).
  const isScrollMode = contentHeightWithGaps > viewportHeight && scrollRange > 0;
  const showScrollbar = isScrollMode;
  // The scrollbar track always matches the visible input height.
  const barHeight = rowHeight;

  // Debug: log bar and textarea heights whenever they change so we can
  // verify that they stay perfectly in sync (e.g. 3 lines → 100px).
  useEffect(() => {
    const el = textareaRef.current;
    const domClient = el?.clientHeight ?? null;
    const domScroll = el?.scrollHeight ?? null;
    // eslint-disable-next-line no-console
    console.log("[GlobalBottomBarWeb] heights", {
      lines: rawLines,
      dynamicHeight,
      barHeight,
      viewportHeight,
      contentHeight,
      domMirrorHeight,
      domClient,
      domScroll,
    });
  }, [rawLines, dynamicHeight, barHeight, viewportHeight, contentHeight, domMirrorHeight]);


  // When the 7th line first appears (i.e. we reach the max bar height but do
  // not yet need scroll), shift the text up by one inner padding so the last
  // visible line sits perfectly against the arrow baseline.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = textareaRef.current;
    if (!el) return;
    const isAtMaxHeight = dynamicHeight >= MAX_BAR_HEIGHT;
    if (
      rawLines === 7 &&
      isAtMaxHeight &&
      el.scrollTop === 0 &&
      wasNearBottomBeforeInputRef.current
    ) {
      el.scrollTop = INNER_PADDING;
    }
  }, [rawLines, dynamicHeight]);

  // In scroll mode, keep the textarea scrolled to the bottom so the last line
  // and the 20px bottom gap are visible, and the scroll indicator stays at bottom.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = textareaRef.current;
    if (!el || !isScrollMode) return;
    if (!wasNearBottomBeforeInputRef.current) return;
    const range = el.scrollHeight - el.clientHeight;
    if (range <= 0) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = range;
      setScrollY(range);
      setDomScrollRange(range);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, isScrollMode]);

  let indicatorHeight = 0;
  let topPosition = 0;
  const effectiveScrollRange = domScrollRange > 0 ? domScrollRange : scrollRange;
  if (showScrollbar && effectiveScrollRange > 0 && contentHeightWithGaps > 0 && barHeight != null) {
    const indicatorHeightRatio = Math.min(1, Math.max(0, viewportHeight / contentHeightWithGaps));
    indicatorHeight = Math.min(barHeight, Math.max(0, barHeight * indicatorHeightRatio));
    const scrollPosition = Math.min(1, Math.max(0, scrollY / effectiveScrollRange));
    const availableSpace = Math.min(barHeight, Math.max(0, barHeight - indicatorHeight));
    topPosition = Math.min(barHeight, Math.max(0, scrollPosition * availableSpace));
  }

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    // Optional: navigate to AI with prompt like GlobalBottomBar
  }, [value]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.block}>
        <View style={[styles.row, { height: rowHeight }]}>
          <View style={styles.inputWrap}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <textarea
              ref={textareaRef}
              data-global-bottom-bar-web
              value={value}
              onInput={handleInput}
              rows={1}
              style={{
                width: "100%",
                // Keep the DOM min/height/max in sync with our computed
                // dynamicHeight so there is no intermediate smaller box
                // (e.g. 60px when we expect 80px on 3 lines).
                minHeight: dynamicHeight,
                height: dynamicHeight,
                maxHeight: dynamicHeight,
                fontSize: 15,
                lineHeight: `${LINE_HEIGHT}px`,
                paddingTop: INNER_PADDING,
                paddingBottom: INNER_PADDING,
                paddingRight: 12,
                boxSizing: "border-box",
                resize: "none",
                border: "none",
                outline: "none",
                color: colors.text,
                backgroundColor: "transparent",
                caretColor: colors.text,
                // Allow scroll exactly when content exceeds the visible viewport height.
                overflow: contentHeightWithGaps > viewportHeight ? "auto" : "hidden",
              }}
              placeholder="AI and search"
            />
          </View>
          <Pressable style={styles.arrowWrap} onPress={handleSend} accessibilityRole="button" accessibilityLabel="Send">
            <Svg width={icons.apply.width} height={icons.apply.height} viewBox="0 0 15 10">
              <Path
                d="M1 5H10M6 1L10 5L6 9"
                stroke={colors.text}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>
      </View>
      {showScrollbar && indicatorHeight > 0 && barHeight != null && (
        <View style={[styles.scrollbarContainer, { height: barHeight }]}>
          <View style={[styles.scrollbarIndicator, { height: indicatorHeight, marginTop: topPosition }]} />
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
  block: {
    width: "100%",
    maxWidth: maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: HORIZONTAL_PADDING,
    // No vertical gap outside the input; the textarea occupies the full bar height.
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: "row",
    // Let children fill the full bar height; vertical positioning is handled
    // inside each child (textarea via INNER_PADDING, arrow via paddingBottom).
    alignItems: "stretch",
    gap: 5,
    position: "relative",
  },
  inputWrap: {
    flex: 1,
    position: "relative",
    // Keep the textarea stuck to the top of the bar; vertical gaps are
    // handled via INNER_PADDING inside the textarea itself.
    justifyContent: "flex-start",
  },
  arrowWrap: {
    // Stick the arrow icon to the bottom edge of the bar with 25px padding.
    justifyContent: "flex-end",
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
    backgroundColor: colors.scrollbar,
  },
});
