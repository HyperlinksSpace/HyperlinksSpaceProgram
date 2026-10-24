import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { AppStringKey } from "../../../locales/appStrings";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { useDeployOwnerContract } from "../../ownerDeploy/useDeployOwnerContract";
import { useSmartActivePurpose } from "../../smart/smartActivePurposeStore";
import {
  bottomBarLabelFitsSlot,
  bottomBarSummarySlotWidthPx,
} from "../bottomBarRowFit";
import { layout, typographyFixedRow30Label, useColors } from "../../theme";

const ACTION_BUTTON_HEIGHT_PX = layout.bottomBar.undercoverButtonHeightPx;
const ACTION_BUTTON_TEXT_INSET_PX = layout.bottomBar.undercoverButtonPaddingHorizontalPx;
const { textToSendIconGapPx: TEXT_TO_BUTTON_GAP_PX } = layout.bottomBar;

function deployCostKeys(purpose: string): { full: AppStringKey; short: AppStringKey } {
  if (purpose === "owner") {
    return {
      full: "smart.footer.deployCost.owner",
      short: "smart.footer.deployCostShort.owner",
    };
  }
  return {
    full: "smart.footer.deployCost",
    short: "smart.footer.deployCostShort",
  };
}

/** In-panel deploy row (swap/send action style): cost label left, deploy button right. */
export function SmartActionRow() {
  const colors = useColors();
  const { t } = useAppStrings();
  const activePurpose = useSmartActivePurpose();
  const ownerDeploy = useDeployOwnerContract();
  const costKeys = deployCostKeys(activePurpose);
  const fullDeployCostLabel = t(costKeys.full);
  const shortDeployCostLabel = t(costKeys.short);
  const [rowWidth, setRowWidth] = useState(0);
  const [buttonWidth, setButtonWidth] = useState(0);
  const [fullLabelWidth, setFullLabelWidth] = useState(0);

  const labelSlotWidth = useMemo(
    () =>
      bottomBarSummarySlotWidthPx({
        rowWidthPx: rowWidth,
        buttonWidthPx: buttonWidth,
        summaryTrailingGapPx: TEXT_TO_BUTTON_GAP_PX,
      }),
    [buttonWidth, rowWidth],
  );
  const canShowFullDeployCostLabel = bottomBarLabelFitsSlot(fullLabelWidth, labelSlotWidth);
  const deployCostLabel = canShowFullDeployCostLabel ? fullDeployCostLabel : shortDeployCostLabel;

  const onRowLayout = useCallback((width: number) => {
    setRowWidth((current) => (current === width ? current : width));
  }, []);

  const onButtonLayout = useCallback((width: number) => {
    setButtonWidth((current) => (current === width ? current : width));
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
      <View
        style={[styles.row, { height: ACTION_BUTTON_HEIGHT_PX }]}
        onLayout={(event) => onRowLayout(Math.round(event.nativeEvent.layout.width))}
      >
        <View style={styles.costLabelSlot}>
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
          accessibilityLabel={t("smart.footer.deployButton")}
          disabled={activePurpose === "owner" && ownerDeploy.busy}
          onPress={
            activePurpose === "owner"
              ? () => {
                  void ownerDeploy.deployFromDraft();
                }
              : undefined
          }
          style={[
            styles.actionButton,
            {
              backgroundColor: colors.undercover,
              opacity: activePurpose === "owner" && ownerDeploy.busy ? 0.7 : 1,
            },
          ]}
          onLayout={(event) => onButtonLayout(Math.round(event.nativeEvent.layout.width))}
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
