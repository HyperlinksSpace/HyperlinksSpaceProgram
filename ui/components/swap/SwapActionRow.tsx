import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { formatSwapTokenAmount } from "../../swap/swapChartFormat";
import { layout, typographyRect15, useColors } from "../../theme";

const ACTION_BUTTON_HEIGHT_PX = 30;
const ACTION_BUTTON_TEXT_INSET_PX = 30;
const FIT_EPSILON_PX = 1;
const { textToSendIconGapPx: TEXT_TO_BUTTON_GAP_PX } = layout.bottomBar;

type Props = {
  dllrAmount: number | null;
};

export function SwapActionRow({ dllrAmount }: Props) {
  const colors = useColors();
  const { t, tf } = useAppStrings();
  const shortSummaryLabel = t("swap.action.summary");
  const fullSummaryLabel =
    dllrAmount != null
      ? tf("swap.action.summaryWithAmount", { amount: formatSwapTokenAmount(dllrAmount) })
      : shortSummaryLabel;
  const [labelSlotWidth, setLabelSlotWidth] = useState(0);
  const [fullLabelWidth, setFullLabelWidth] = useState(0);

  const labelMeasured = labelSlotWidth > 0 && fullLabelWidth > 0;
  const canShowFullSummaryLabel =
    labelMeasured && fullLabelWidth <= labelSlotWidth + FIT_EPSILON_PX;
  const summaryLabel = canShowFullSummaryLabel ? fullSummaryLabel : shortSummaryLabel;

  const onLabelSlotLayout = useCallback((width: number) => {
    setLabelSlotWidth((current) => (current === width ? current : width));
  }, []);

  const onFullLabelMeasureLayout = useCallback((width: number) => {
    setFullLabelWidth((current) => (current === width ? current : width));
  }, []);

  useEffect(() => {
    setFullLabelWidth(0);
  }, [fullSummaryLabel]);

  return (
    <View style={styles.wrapper}>
      <Text
        style={[typographyRect15, styles.fullLabelMeasure, { color: colors.primary }]}
        onLayout={(event) => onFullLabelMeasureLayout(Math.ceil(event.nativeEvent.layout.width))}
      >
        {fullSummaryLabel}
      </Text>
      <View style={[styles.row, { height: ACTION_BUTTON_HEIGHT_PX }]}>
        <View
          style={styles.summaryLabelSlot}
          onLayout={(event) => onLabelSlotLayout(Math.round(event.nativeEvent.layout.width))}
        >
          <Text
            style={[typographyRect15, styles.summaryLabel, { color: colors.primary }]}
            numberOfLines={1}
            accessibilityLabel={fullSummaryLabel}
          >
            {summaryLabel}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, { backgroundColor: colors.undercover }]}
        >
          <Text style={[typographyRect15, { color: colors.primary, textAlign: "center" }]} numberOfLines={1}>
            {t("swap.action.button")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    position: "relative",
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: TEXT_TO_BUTTON_GAP_PX,
  },
  summaryLabelSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  summaryLabel: {
    minWidth: 0,
  },
  fullLabelMeasure: {
    position: "absolute",
    opacity: 0,
    top: 0,
    left: 0,
    zIndex: -1,
    flexShrink: 0,
    ...Platform.select({
      web: {
        whiteSpace: "nowrap" as const,
        width: "max-content" as const,
        pointerEvents: "none" as const,
      },
      default: {},
    }),
  },
  actionButton: {
    flexShrink: 0,
    height: ACTION_BUTTON_HEIGHT_PX,
    paddingHorizontal: ACTION_BUTTON_TEXT_INSET_PX,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxSizing: "border-box" as const },
      default: {},
    }),
  },
});
