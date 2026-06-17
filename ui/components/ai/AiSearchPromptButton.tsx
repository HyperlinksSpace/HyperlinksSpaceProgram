import { createElement, useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text, View, type TextLayoutEvent } from "react-native";

import { WEB_UI_SANS_STACK } from "../../fonts";
import {
  typographyRect15,
  useColors,
  aiPromptButtonActiveBackground,
  aiPromptButtonHoverBackground,
  type ThemeColors,
  type ThemeName,
} from "../../theme";
import { useTelegram } from "../Telegram";
import {
  AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX,
  AI_PROMPT_BUTTON_PADDING_VERTICAL_PX,
  AI_PROMPT_BUTTON_TEXT_FONT_SIZE_PX,
  AI_PROMPT_BUTTON_TEXT_LINE_HEIGHT_PX,
  measurePromptButtonOuterWidth,
} from "./aiSearchPromptButtonMeasure";

const BUTTON_BORDER_RADIUS_PX = 10;

type Props = {
  label: string;
  columnWidth: number;
  onPress: () => void;
};

function promptButtonBackground(
  colors: ThemeColors,
  scheme: ThemeName,
  state: { pressed: boolean; hovered: boolean },
): string {
  if (state.pressed) return aiPromptButtonActiveBackground(colors, scheme);
  if (state.hovered) return aiPromptButtonHoverBackground(colors, scheme);
  return colors.undercover;
}

function fittedWidthFromTextLayout(event: TextLayoutEvent, columnWidth: number): number {
  const lines = event.nativeEvent.lines;
  if (lines.length === 0) return 0;
  const longestLine = Math.max(...lines.map((line) => line.width));
  return Math.min(
    columnWidth,
    Math.ceil(longestLine) + AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX * 2,
  );
}

function AiSearchPromptButtonWeb({
  label,
  columnWidth,
  onPress,
  color,
  colors,
  colorScheme,
}: Props & {
  color: string;
  colors: ThemeColors;
  colorScheme: ThemeName;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const buttonWidth = useMemo(
    () => (columnWidth > 0 ? measurePromptButtonOuterWidth(label, columnWidth) : 0),
    [label, columnWidth],
  );

  const backgroundColor = promptButtonBackground(colors, colorScheme, { pressed, hovered });

  if (buttonWidth <= 0) return null;

  return (
    <View style={{ alignSelf: "flex-start", maxWidth: columnWidth }}>
      {createElement(
        "button",
        {
          type: "button",
          onClick: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            onPress();
          },
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => {
            setHovered(false);
            setPressed(false);
          },
          onMouseDown: () => setPressed(true),
          onMouseUp: () => setPressed(false),
          style: {
            width: buttonWidth,
            boxSizing: "border-box",
            margin: 0,
            padding: `${AI_PROMPT_BUTTON_PADDING_VERTICAL_PX}px ${AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX}px`,
            borderRadius: BUTTON_BORDER_RADIUS_PX,
            backgroundColor,
            border: "none",
            appearance: "none",
            WebkitAppearance: "none",
            cursor: "pointer",
            display: "block",
            fontFamily: WEB_UI_SANS_STACK,
            fontSize: AI_PROMPT_BUTTON_TEXT_FONT_SIZE_PX,
            lineHeight: `${AI_PROMPT_BUTTON_TEXT_LINE_HEIGHT_PX}px`,
            fontWeight: 400,
            color,
            textAlign: "left",
            whiteSpace: "normal",
            overflowWrap: "break-word",
          },
        },
        label,
      )}
    </View>
  );
}

function AiSearchPromptButtonNative({
  label,
  columnWidth,
  onPress,
  color,
  colors,
  colorScheme,
}: Props & {
  color: string;
  colors: ThemeColors;
  colorScheme: ThemeName;
}) {
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);

  const onMeasureTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (columnWidth <= 0) return;
      const next = fittedWidthFromTextLayout(event, columnWidth);
      if (next <= 0) return;
      setButtonWidth((current) => (current === next ? current : next));
    },
    [columnWidth],
  );

  const textStyle = [
    typographyRect15,
    {
      fontSize: AI_PROMPT_BUTTON_TEXT_FONT_SIZE_PX,
      lineHeight: AI_PROMPT_BUTTON_TEXT_LINE_HEIGHT_PX,
      fontWeight: "400" as const,
      color,
    },
  ];

  const maxContentWidth = Math.max(0, columnWidth - AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX * 2);

  return (
    <View style={{ alignSelf: "flex-start", maxWidth: columnWidth }}>
      {columnWidth > 0 ? (
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
        style={({ pressed, hovered }) => [
          {
            borderRadius: BUTTON_BORDER_RADIUS_PX,
            paddingHorizontal: AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX,
            paddingVertical: AI_PROMPT_BUTTON_PADDING_VERTICAL_PX,
            alignSelf: "flex-start",
            backgroundColor: promptButtonBackground(colors, colorScheme, {
              pressed,
              hovered: hovered ?? false,
            }),
          },
          buttonWidth != null ? { width: buttonWidth } : null,
        ]}
      >
        <Text style={textStyle}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Prompt chip: cover width matches the longest wrapped line (15px side / 10px vertical padding). */
export function AiSearchPromptButton({ label, columnWidth, onPress }: Props) {
  const colors = useColors();
  const { colorScheme } = useTelegram();

  if (Platform.OS === "web") {
    return (
      <AiSearchPromptButtonWeb
        label={label}
        columnWidth={columnWidth}
        onPress={onPress}
        color={colors.primary}
        colors={colors}
        colorScheme={colorScheme}
      />
    );
  }

  return (
    <AiSearchPromptButtonNative
      label={label}
      columnWidth={columnWidth}
      onPress={onPress}
      color={colors.primary}
      colors={colors}
      colorScheme={colorScheme}
    />
  );
}
