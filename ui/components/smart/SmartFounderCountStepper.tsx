import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyRect15, useColors } from "../../theme";

const CIRCLE_SIZE_PX = 30;
const PILL_WIDTH_PX = 70;
const PILL_HEIGHT_PX = 30;
const PILL_RADIUS_PX = PILL_HEIGHT_PX / 2;
const STEP_GAP_PX = 10;

const MIN_FOUNDERS = 1;
const MAX_FOUNDERS = 99;

type Props = {
  value: number;
  onChange: (next: number) => void;
};

function CircleStepButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.circle, { backgroundColor: colors.undercover }]}
    >
      <View style={styles.circleTextArea}>
        <Text style={[typographyRect15, styles.circleGlyph, { color: colors.primary }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** [ − ] [ count ] [ + ] founder count control. */
export function SmartFounderCountStepper({ value, onChange }: Props) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <CircleStepButton
        label="−"
        accessibilityLabel="Decrease founder count"
        onPress={() => onChange(Math.max(MIN_FOUNDERS, value - 1))}
      />
      <View style={[styles.pill, { backgroundColor: colors.undercover }]}>
        <Text style={[typographyRect15, styles.pillValue, { color: colors.primary }]}>{String(value)}</Text>
      </View>
      <CircleStepButton
        label="+"
        accessibilityLabel="Increase founder count"
        onPress={() => onChange(Math.min(MAX_FOUNDERS, value + 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: STEP_GAP_PX,
  },
  circle: {
    width: CIRCLE_SIZE_PX,
    height: CIRCLE_SIZE_PX,
    borderRadius: CIRCLE_SIZE_PX / 2,
    overflow: "hidden",
  },
  circleTextArea: {
    width: CIRCLE_SIZE_PX,
    height: CIRCLE_SIZE_PX,
    alignItems: "center",
    justifyContent: "center",
  },
  circleGlyph: {
    fontSize: 15,
    lineHeight: 18,
    textAlign: "center",
  },
  pill: {
    width: PILL_WIDTH_PX,
    height: PILL_HEIGHT_PX,
    borderRadius: PILL_RADIUS_PX,
    alignItems: "center",
    justifyContent: "center",
  },
  pillValue: {
    fontSize: 15,
    lineHeight: 18,
    textAlign: "center",
  },
});
