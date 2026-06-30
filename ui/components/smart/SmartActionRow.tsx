import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { layout, typographyFixedRow30Label, useColors } from "../../theme";

const ACTION_BUTTON_HEIGHT_PX = 30;
const ACTION_BUTTON_TEXT_INSET_PX = 30;
const FIT_EPSILON_PX = 1;
const { textToSendIconGapPx: TEXT_TO_BUTTON_GAP_PX } = layout.bottomBar;

/** In-panel deploy row (swap/send action style): cost label left, deploy button right. */
export function SmartActionRow() {
  const colors = useColors();
  const { t } = useAppStrings();
  const fullDeployCostLabel = t("smart.footer.deployCost");
  const shortDeployCostLabel = t("smart.footer.deployCostShort");
  const [labelSlotWidth, setLabelSlotWidth] = useState(0);
  const [fullLabelWidth, setFullLabelWidth] = useState(0);

  const labelMeasured = labelSlotWidth > 0 && fullLabelWidth > 0;
  const canShowFullDeployCostLabel =
    labelMeasured && fullLabelWidth <= labelSlotWidth + FIT_EPSILON_PX;
  const deployCostLabel = canShowFullDeployCostLabel ? fullDeployCostLabel : shortDeployCostLabel;

  const onLabelSlotLayout = useCallback((width: number) => {
    setLabelSlotWidth((current) => (current === width ? current : width));
  }, []);

  const onFullLabelMeasureLayout = useCallback((width: number) => {
    setFullLabelWidth((current) => (current === width ? current : width));
  }, []);

  useEffect(() => {
    setFullLabelWidth(0);
  }, [fullDeployCostLabel]);

  return (
    <View style={styles.wrapper}>
      <Text
        style={[typographyFixedRow30Label, styles.fullLabelMeasure, { color: colors.primary }]}
        onLayout={(event) => onFullLabelMeasureLayout(Math.ceil(event.nativeEvent.layout.width))}
      >
        {fullDeployCostLabel}
      </Text>
      <View style={[styles.row, { height: ACTION_BUTTON_HEIGHT_PX }]}>
        <View
          style={styles.costLabelSlot}
          onLayout={(event) => onLabelSlotLayout(Math.round(event.nativeEvent.layout.width))}
        >
          <Text
            style={[typographyFixedRow30Label, styles.costLabel, { color: colors.primary }]}
            numberOfLines={1}
            accessibilityLabel={fullDeployCostLabel}
          >
            {deployCostLabel}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, { backgroundColor: colors.undercover }]}
        >
          <Text style={[typographyFixedRow30Label, { color: colors.primary, textAlign: "center" }]} numberOfLines={1}>
            {t("smart.footer.deployButton")}
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
  costLabelSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  costLabel: {
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
