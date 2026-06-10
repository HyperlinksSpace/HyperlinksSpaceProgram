import { useCallback } from "react";
import { View } from "react-native";
import { closeSwapCurrencyPicker } from "../../swap/swapCurrencyPicker";
import { layout } from "../../theme";
import { useTelegram } from "../Telegram";
import { ChooseCurrencySubheader } from "./ChooseCurrencySubheader";

type Props = {
  onFilterPress?: () => void;
  onBackPress?: () => void;
};

/** Wide split-column picker body (subheader + list area). */
export function ChooseCurrencyPanelContent({ onFilterPress, onBackPress }: Props) {
  const { isInTelegram } = useTelegram();
  const contentInset = layout.contentSideInsetPx;

  const handleBack = useCallback(() => {
    closeSwapCurrencyPicker();
    onBackPress?.();
  }, [onBackPress]);

  return (
    <View style={{ flex: 1, width: "100%", alignSelf: "stretch", minHeight: 0 }}>
      <View style={{ marginHorizontal: -contentInset }}>
        <ChooseCurrencySubheader
          onBackPress={handleBack}
          onFilterPress={onFilterPress}
          showBack={!isInTelegram}
          showFilter
          titleAlign={isInTelegram ? "left" : "center"}
        />
      </View>
      <View style={{ flex: 1, width: "100%", paddingHorizontal: contentInset }} />
    </View>
  );
}
