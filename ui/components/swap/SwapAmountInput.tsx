import { Platform, TextInput, type TextStyle } from "react-native";

import { sanitizeSwapAmountInput } from "../../swap/sanitizeSwapAmountInput";
import { typographyAeroport20, useColors } from "../../theme";

type Props = {
  value: string;
  onChangeValue: (next: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  style?: TextStyle;
};

/**
 * Swap Sell/Buy amount field — same typography as static amount text (Send panel pattern).
 */
export function SwapAmountInput({
  value,
  onChangeValue,
  placeholder = "0",
  accessibilityLabel,
  style,
}: Props) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChangeValue(sanitizeSwapAmountInput(text))}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={colors.secondary}
      cursorColor={colors.primary}
      accessibilityLabel={accessibilityLabel}
      style={[
        typographyAeroport20,
        {
          fontWeight: "500",
          lineHeight: 30,
          color: colors.primary,
          flex: 1,
          minWidth: 0,
          padding: 0,
          margin: 0,
          ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
        },
        style,
      ]}
    />
  );
}
