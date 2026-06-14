import { useState } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  layout,
  useColors,
  welcomeAuthButtonActiveBackground,
  welcomeAuthButtonHoverBackground,
} from "../../theme";
import { useTelegram } from "../Telegram";
import { SwapFilterIcon } from "./SwapFilterIcon";

const FILTER_BUTTON_SIZE_PX = layout.authenticatedHome.headerIconDisplaySize;

type Props = {
  onPress?: () => void;
};

/** 30×30 `undercover` tap target with hover/press feedback — same shell as other header controls. */
export function SwapFilterButton({ onPress }: Props) {
  const colors = useColors();
  const { t } = useAppStrings();
  const { colorScheme } = useTelegram();
  const [hover, setHover] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("swap.chooseCurrency.filterA11y")}
      onHoverIn={Platform.OS === "web" ? () => setHover(true) : undefined}
      onHoverOut={Platform.OS === "web" ? () => setHover(false) : undefined}
      style={({ pressed }) => {
        const webHover = Platform.OS === "web" && hover;
        let backgroundColor = colors.undercover;
        if (pressed) {
          backgroundColor = welcomeAuthButtonActiveBackground(colors, colorScheme);
        } else if (webHover) {
          backgroundColor = welcomeAuthButtonHoverBackground(colors, colorScheme);
        }
        return [
          styles.button,
          {
            backgroundColor,
            opacity: pressed ? 0.92 : 1,
          },
        ];
      }}
    >
      <SwapFilterIcon color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: FILTER_BUTTON_SIZE_PX,
    height: FILTER_BUTTON_SIZE_PX,
    justifyContent: "center",
    alignItems: "center",
  },
});
