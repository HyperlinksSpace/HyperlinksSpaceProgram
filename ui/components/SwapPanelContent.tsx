import { useEffect } from "react";
import { View } from "react-native";
import { swapChartLog } from "../swap/swapChartDebug";
import { useSwapChart } from "../swap/useSwapChart";
import { SwapChartView } from "./swap/SwapChartView";
import { SwapFormBelowChart } from "./swap/SwapFormBelowChart";
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
  } = useSwapChart("d");

  useEffect(() => {
    swapChartLog("panel_mount", {
      swapFirstRowTopInsetPx: layout.authenticatedHome.swapFirstRowTopInsetPx,
      swapStatsRowTopGapPx: layout.authenticatedHome.swapStatsRowTopGapPx,
      swapChartTopGapPx: layout.authenticatedHome.swapChartTopGapPx,
    });
  }, []);

  const displayTonPriceUsd =
    selectedPointIndex != null &&
    series &&
    selectedPointIndex >= 0 &&
    selectedPointIndex < series.points.length
      ? series.points[selectedPointIndex]!.price
      : effectiveTonPriceUsd;

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        paddingTop: layout.authenticatedHome.swapFirstRowTopInsetPx,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <View style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <SwapRateRow
          intervalKey={intervalKey}
          onIntervalKeyChange={setIntervalKey}
          tonPriceUsd={displayTonPriceUsd}
        />
        <View style={{ marginTop: layout.authenticatedHome.swapStatsRowTopGapPx }}>
          <SwapStatsRow marketStats={marketStats} />
        </View>
        <View
          style={{
            flex: 1,
            marginTop: layout.authenticatedHome.swapChartTopGapPx,
            minHeight: 0,
            overflow: "hidden",
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
      <SwapFormBelowChart effectiveTonPriceUsd={displayTonPriceUsd} />
    </View>
  );
}
