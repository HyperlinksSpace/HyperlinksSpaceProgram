import { useCallback } from "react";
import { View } from "react-native";
import { closeSwapCurrencyPicker } from "../../swap/swapCurrencyPicker";
import { useChooseCurrencyRows } from "../../swap/useChooseCurrencyRows";
import { layout } from "../../theme";
import { useTelegram } from "../Telegram";
import { ChooseCurrencySubheader } from "./ChooseCurrencySubheader";
import { ChooseCurrencyTable } from "./ChooseCurrencyTable";

type Props = {
  onFilterPress?: () => void;
  onBackPress?: () => void;
  walletAddress?: string | null;
};

/** Wide split-column picker body (subheader + list area). */
export function ChooseCurrencyPanelContent({ onFilterPress, onBackPress, walletAddress }: Props) {
  const { isInTelegram } = useTelegram();
  const { rows, isLoading, isFetchingMore, error, loadMore } = useChooseCurrencyRows(walletAddress);
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
      <View style={{ flex: 1, width: "100%", minHeight: 0 }}>
        <ChooseCurrencyTable
          rows={rows}
          isLoading={isLoading}
          isFetchingMore={isFetchingMore}
          loadError={error}
          onLoadMore={loadMore}
        />
      </View>
    </View>
  );
}
