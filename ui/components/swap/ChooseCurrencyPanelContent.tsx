import { useCallback } from "react";
import { View } from "react-native";
import { closeSwapCurrencyPicker } from "../../swap/swapCurrencyPicker";
import { useChooseCurrencyChrome } from "../../swap/chooseCurrencyChrome";
import { useChooseCurrencyRows } from "../../swap/useChooseCurrencyRows";
import { layout } from "../../theme";
import { useAuthenticatedHomeSplitLayoutMetrics } from "../AuthenticatedHomeSplitLayoutMetricsContext";
import { ChooseCurrencySubheader } from "./ChooseCurrencySubheader";
import { ChooseCurrencyTable } from "./ChooseCurrencyTable";

type Props = {
  onFilterPress?: () => void;
  onBackPress?: () => void;
  walletAddress?: string | null;
};

/** Wide split-column picker body (subheader + list area). */
export function ChooseCurrencyPanelContent({ onFilterPress, onBackPress, walletAddress }: Props) {
  const { rows, isLoading, isFetchingMore, error, loadMore } = useChooseCurrencyRows(walletAddress);
  const contentInset = layout.contentSideInsetPx;
  const splitMetrics = useAuthenticatedHomeSplitLayoutMetrics();
  const scrollShellBleed = { marginHorizontal: -contentInset };
  const { showSubheaderBack, titleAlign } = useChooseCurrencyChrome();

  const handleBack = useCallback(() => {
    closeSwapCurrencyPicker();
    onBackPress?.();
  }, [onBackPress]);

  return (
    <View style={{ flex: 1, width: "100%", alignSelf: "stretch", minHeight: 0 }}>
      <View style={scrollShellBleed}>
        <ChooseCurrencySubheader
          onBackPress={handleBack}
          onFilterPress={onFilterPress}
          showBack={showSubheaderBack}
          showFilter
          titleAlign={titleAlign}
        />
      </View>
      <View style={{ flex: 1, minHeight: 0, ...scrollShellBleed }}>
        <ChooseCurrencyTable
          rows={rows}
          isLoading={isLoading}
          isFetchingMore={isFetchingMore}
          loadError={error}
          onLoadMore={loadMore}
          columnShellWidthPx={splitMetrics?.middleColumnWidthPx ?? 0}
        />
      </View>
    </View>
  );
}
