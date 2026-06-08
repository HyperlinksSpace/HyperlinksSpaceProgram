import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from "react-native";

import { typographyRect15, useColors } from "../../theme";

const BUTTON_PADDING_HORIZONTAL_PX = 10;
const BUTTON_PADDING_VERTICAL_PX = 15;
const BUTTON_BORDER_RADIUS_PX = 10;
const BUTTON_TEXT_LINE_HEIGHT_PX = 25;
const BUTTON_TEXT_FONT_SIZE_PX = 15;

type Props = {
  label: string;
  onPress: () => void;
};

/** Prompt chip: hugs single-line copy; stretches to column width when text wraps. */
export function AiSearchPromptButton({ label, onPress }: Props) {
  const colors = useColors();
  const [columnWidth, setColumnWidth] = useState(0);
  const [usesFullWidth, setUsesFullWidth] = useState<boolean | null>(null);

  const onColumnLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setColumnWidth((current) => (current === next ? current : next));
    setUsesFullWidth(null);
  }, []);

  useEffect(() => {
    setUsesFullWidth(null);
  }, [label, columnWidth]);

  const onMeasureTextLayout = useCallback(
    (lineCount: number) => {
      if (columnWidth <= 0) return;
      setUsesFullWidth((current) => {
        const next = lineCount > 1;
        return current === next ? current : next;
      });
    },
    [columnWidth],
  );

  const textStyle = [
    typographyRect15,
    {
      fontSize: BUTTON_TEXT_FONT_SIZE_PX,
      lineHeight: BUTTON_TEXT_LINE_HEIGHT_PX,
      fontWeight: "400" as const,
      color: colors.primary,
    },
  ];

  return (
    <View style={{ width: "100%", alignSelf: "stretch" }} onLayout={onColumnLayout}>
      {columnWidth > 0 && usesFullWidth === null ? (
        <Text
          style={[
            ...textStyle,
            {
              position: "absolute",
              opacity: 0,
              width: columnWidth,
              pointerEvents: "none",
            },
            Platform.OS === "web" ? ({ visibility: "hidden" } as const) : null,
          ]}
          onTextLayout={(event) => onMeasureTextLayout(event.nativeEvent.lines.length)}
        >
          {label}
        </Text>
      ) : null}

      {usesFullWidth !== null ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={[
            {
              backgroundColor: colors.undercover,
              borderRadius: BUTTON_BORDER_RADIUS_PX,
              paddingHorizontal: BUTTON_PADDING_HORIZONTAL_PX,
              paddingVertical: BUTTON_PADDING_VERTICAL_PX,
              alignSelf: usesFullWidth ? ("stretch" as const) : ("flex-start" as const),
            },
            Platform.OS === "web" ? { boxSizing: "border-box" as const } : null,
          ]}
        >
          <Text style={textStyle}>{label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
