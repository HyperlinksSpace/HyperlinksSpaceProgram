import { View } from "react-native";
import { useSwapChart } from "../swap/useSwapChart";
import { SwapChartView } from "./swap/SwapChartView";
import { SwapRateRow } from "./SwapRateRow";
import { SwapStatsRow } from "./SwapStatsRow";
import { layout } from "../theme";

/** Swap panel body: rate row, stats, and interactive chart (fills remaining height). */
export function SwapPanelContent() {
  const {
    intervalKey,
    setIntervalKey,
    resolution,
    series,
    isLoadingChart,
    chartError,
    selectedPointIndex,
    setSelectedPointIndex,
    marketStats,
    effectiveTonPriceUsd,
  } = useSwapChart("m");

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        paddingTop: layout.authenticatedHome.swapFirstRowTopInsetPx,
        minHeight: 0,
      }}
    >
      <SwapRateRow
        intervalKey={intervalKey}
        onIntervalKeyChange={setIntervalKey}
        tonPriceUsd={effectiveTonPriceUsd}
      />
      <View style={{ marginTop: layout.authenticatedHome.swapStatsRowTopGapPx }}>
        <SwapStatsRow marketStats={marketStats} />
      </View>
      <View
        style={{
          flex: 1,
          marginTop: layout.authenticatedHome.swapChartTopGapPx,
          minHeight: 0,
        }}
      >
        <SwapChartView
          resolution={resolution}
          intervalKey={intervalKey}
          onIntervalKeyChange={setIntervalKey}
          series={series}
          isLoading={isLoadingChart}
          error={chartError}
          selectedPointIndex={selectedPointIndex}
          onSelectedPointIndexChange={setSelectedPointIndex}
        />
      </View>
    </View>
  );
}
