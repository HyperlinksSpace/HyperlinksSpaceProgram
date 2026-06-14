import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { useAppStrings } from "../../locales/AppStringsContext";
import { useColors } from "../theme";
import { AuthenticatedAppShell } from "../components/AuthenticatedAppShell";
import { SwapFilterIcon } from "../components/icons/SwapFilterIcon";
import { ChooseCurrencyPanelContent } from "../components/swap/ChooseCurrencyPanelContent";
import { useTelegram } from "../components/Telegram";

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

/** Narrow `/swap/currency`: logo header + scrollable token list. */
export function ChooseCurrencyScreen() {
  const router = useRouter();
  const { wallet } = useTelegram();

  const onFilterPress = useCallback(() => {
    // Filter sheet — placeholder for follow-up.
  }, []);

  const onBackPress = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <AuthenticatedAppShell
      showBrowserBackButton
      headerRightAccessory={<SwapFilterHeaderButton onPress={onFilterPress} />}
    >
      <View style={{ flex: 1, width: "100%", minHeight: 0 }}>
        <ChooseCurrencyPanelContent
          onFilterPress={onFilterPress}
          onBackPress={onBackPress}
          walletAddress={wallet?.wallet_address ?? null}
        />
      </View>
    </AuthenticatedAppShell>
  );
}
