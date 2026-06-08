import { useCallback, useLayoutEffect, useState } from "react";
import { Platform, Pressable, Text, View, type TextLayoutEvent } from "react-native";

import { WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, useColors } from "../../theme";

const BUTTON_PADDING_HORIZONTAL_PX = 10;
const BUTTON_PADDING_VERTICAL_PX = 10;
const BUTTON_BORDER_RADIUS_PX = 10;
const BUTTON_TEXT_LINE_HEIGHT_PX = 25;
const BUTTON_TEXT_FONT_SIZE_PX = 15;

type Props = {
  label: string;
  columnWidth: number;
  onPress: () => void;
};

function applyMeasureTextStyles(element: HTMLElement) {
  element.style.fontFamily = WEB_UI_SANS_STACK;
  element.style.fontSize = `${BUTTON_TEXT_FONT_SIZE_PX}px`;
  element.style.fontWeight = "400";
  element.style.lineHeight = `${BUTTON_TEXT_LINE_HEIGHT_PX}px`;
  element.style.whiteSpace = "normal";
  element.style.overflowWrap = "break-word";
}

/** Longest visual line when copy wraps within `maxContentWidth`. */
function measureLongestWrappedLineWidth(label: string, maxContentWidth: number): number {
  if (typeof document === "undefined" || maxContentWidth <= 0) return 0;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";
  container.style.width = `${maxContentWidth}px`;
  applyMeasureTextStyles(container);
  container.textContent = label;
  document.body.appendChild(container);

  let longestLine = 0;
  const textNode = container.firstChild;
  if (textNode) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rects = range.getClientRects();
    for (let index = 0; index < rects.length; index += 1) {
      longestLine = Math.max(longestLine, rects[index]?.width ?? 0);
    }
  }

  document.body.removeChild(container);
  if (longestLine > 0) return Math.ceil(longestLine);

  const nowrap = document.createElement("span");
  nowrap.style.position = "fixed";
  nowrap.style.left = "-9999px";
  nowrap.style.visibility = "hidden";
  applyMeasureTextStyles(nowrap);
  nowrap.style.whiteSpace = "nowrap";
  nowrap.textContent = label;
  document.body.appendChild(nowrap);
  const singleLine = Math.ceil(nowrap.getBoundingClientRect().width);
  document.body.removeChild(nowrap);
  return singleLine;
}

function fittedButtonWidth(label: string, columnWidth: number): number {
  const maxContentWidth = Math.max(0, columnWidth - BUTTON_PADDING_HORIZONTAL_PX * 2);
  const longestLine = measureLongestWrappedLineWidth(label, maxContentWidth);
  return Math.min(columnWidth, longestLine + BUTTON_PADDING_HORIZONTAL_PX * 2);
}

function fittedWidthFromTextLayout(event: TextLayoutEvent, columnWidth: number): number {
  const lines = event.nativeEvent.lines;
  if (lines.length === 0) return 0;
  const longestLine = Math.max(...lines.map((line) => line.width));
  return Math.min(columnWidth, Math.ceil(longestLine) + BUTTON_PADDING_HORIZONTAL_PX * 2);
}

/** Prompt chip: width hugs the longest line after wrap (even padding left/right). */
export function AiSearchPromptButton({ label, columnWidth, onPress }: Props) {
  const colors = useColors();
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);

  const syncButtonWidth = useCallback(
    (nextWidth: number) => {
      if (nextWidth <= 0) return;
      setButtonWidth((current) => (current === nextWidth ? current : nextWidth));
    },
    [],
  );

  const onMeasureTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (columnWidth <= 0) return;
      syncButtonWidth(fittedWidthFromTextLayout(event, columnWidth));
    },
    [columnWidth, syncButtonWidth],
  );

  useLayoutEffect(() => {
    if (columnWidth <= 0) {
      setButtonWidth(null);
      return;
    }
    if (Platform.OS === "web") {
      syncButtonWidth(fittedButtonWidth(label, columnWidth));
    }
  }, [label, columnWidth, syncButtonWidth]);

  const textStyle = [
    typographyRect15,
    {
      fontSize: BUTTON_TEXT_FONT_SIZE_PX,
      lineHeight: BUTTON_TEXT_LINE_HEIGHT_PX,
      fontWeight: "400" as const,
      color: colors.primary,
    },
  ];

  const maxContentWidth = Math.max(0, columnWidth - BUTTON_PADDING_HORIZONTAL_PX * 2);

  return (
    <View style={{ width: "100%", alignSelf: "stretch" }}>
      {Platform.OS !== "web" && columnWidth > 0 ? (
        <Text
          style={[
            ...textStyle,
            {
              position: "absolute",
              opacity: 0,
              width: maxContentWidth,
              left: 0,
              top: 0,
              zIndex: -1,
              pointerEvents: "none",
            },
          ]}
          onTextLayout={onMeasureTextLayout}
        >
          {label}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[
          {
            backgroundColor: colors.undercover,
            borderRadius: BUTTON_BORDER_RADIUS_PX,
            paddingHorizontal: BUTTON_PADDING_HORIZONTAL_PX,
            paddingVertical: BUTTON_PADDING_VERTICAL_PX,
            alignSelf: "flex-start",
          },
          buttonWidth != null ? { width: buttonWidth } : null,
          Platform.OS === "web" ? { boxSizing: "border-box" as const, maxWidth: columnWidth } : null,
        ]}
      >
        <Text
          style={[
            textStyle,
            buttonWidth != null
              ? { width: buttonWidth - BUTTON_PADDING_HORIZONTAL_PX * 2, flexShrink: 0 }
              : null,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
