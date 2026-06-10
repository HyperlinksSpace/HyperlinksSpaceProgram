import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { useAppStrings } from "../../locales/AppStringsContext";
import { useColors } from "../theme";
import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SwapFilterIcon } from "../components/icons/SwapFilterIcon";

function SwapFilterHeaderButton({ onPress }: { onPress?: () => void }) {
  const colors = useColors();
  const { t } = useAppStrings();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("swap.chooseCurrency.filterA11y")}
      hitSlop={8}
      style={{ minWidth: 20, minHeight: 24, justifyContent: "center", alignItems: "center" }}
    >
      <SwapFilterIcon color={colors.primary} />
    </Pressable>
  );
}

/** Narrow `/swap/currency`: logo header + filter only (subheader is wide split-column only). */
export function ChooseCurrencyScreen() {
  const onFilterPress = useCallback(() => {
    // Filter sheet — placeholder for follow-up.
  }, []);

  return (
    <AuthenticatedAppShell
      showBrowserBackButton
      headerRightAccessory={<SwapFilterHeaderButton onPress={onFilterPress} />}
    >
      <View style={{ flex: 1, width: "100%" }} />
    </AuthenticatedAppShell>
  );
}
