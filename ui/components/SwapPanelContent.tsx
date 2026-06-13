import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { SWAP_CHART_BLOCK_MIN_HEIGHT_PX } from "../swap/swapChartConstants";
import { swapChartLog } from "../swap/swapChartDebug";
import { useSwapChart } from "../swap/useSwapChart";
import { HspScrollColumn, type HspScrollMetrics } from "./HspScrollColumn";
import { SwapChartView } from "./swap/SwapChartView";
import { SwapFormBelowChart } from "./swap/SwapFormBelowChart";
import { SwapRateRow } from "./SwapRateRow";
import { SwapStatsRow } from "./SwapStatsRow";
import { layout } from "../theme";

const SCROLL_OVERFLOW_EPSILON_PX = 0.5;

function swapPanelContentOverflows(layoutH: number, contentH: number): boolean {
  return layoutH > 0 && contentH > layoutH + SCROLL_OVERFLOW_EPSILON_PX;
}

/** Swap panel body: rate row, stats, chart (min 55px line area), and buy/sell form. Scrolls when content exceeds viewport (footer bar excluded). */
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

  const { width: windowWidth } = useWindowDimensions();
  const showSwapActionBlock = windowWidth <= layout.authenticatedHome.secondBreakpoint;
  const [viewportH, setViewportH] = useState(0);
  /** `null` = first intrinsic measure pass; then fixed scroll vs flex-fill layout. */
  const [needsScroll, setNeedsScroll] = useState<boolean | null>(null);
  const scrollLayoutReady = needsScroll !== null;
  const intrinsicMinContentHRef = useRef(0);

  useEffect(() => {
    swapChartLog("panel_mount", {
      swapFirstRowTopInsetPx: layout.authenticatedHome.swapFirstRowTopInsetPx,
      swapStatsRowTopGapPx: layout.authenticatedHome.swapStatsRowTopGapPx,
      swapChartTopGapPx: layout.authenticatedHome.swapChartTopGapPx,
    });
  }, []);

  useEffect(() => {
    intrinsicMinContentHRef.current = 0;
    setNeedsScroll(null);
  }, [showSwapActionBlock]);

  useEffect(() => {
    if (viewportH <= 0 || intrinsicMinContentHRef.current <= 0) return;
    const overflow = swapPanelContentOverflows(viewportH, intrinsicMinContentHRef.current);
    setNeedsScroll(overflow);
    swapChartLog("panel_scroll_state", {
      viewportH,
      layoutH: viewportH,
      contentH: intrinsicMinContentHRef.current,
      needsScroll: overflow,
      reason: "viewport_resize",
    });
  }, [viewportH]);

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportH(e.nativeEvent.layout.height);
  }, []);

  const onScrollMetrics = useCallback(
    (metrics: HspScrollMetrics) => {
      if (metrics.contentH <= 0) return;
      if (intrinsicMinContentHRef.current <= 0) {
        intrinsicMinContentHRef.current = metrics.contentH;
      }
      if (needsScroll !== null) return;
      if (viewportH <= 0) return;
      const overflow = swapPanelContentOverflows(metrics.layoutH, metrics.contentH);
      setNeedsScroll(overflow);
      swapChartLog("panel_scroll_state", {
        viewportH,
        layoutH: metrics.layoutH,
        contentH: metrics.contentH,
        needsScroll: overflow,
        reason: "intrinsic_measure",
      });
    },
    [needsScroll, viewportH],
  );

  const ah = layout.authenticatedHome;
  const contentInset = layout.contentSideInsetPx;
  /** Bleed scroll shell to column/screen edge so the thumb uses {@link layout.scrollIndicatorRightInsetPx} like welcome `/`. */
  const scrollShellBleed = { marginHorizontal: -contentInset };
  const scrollContentPadding = {
    paddingTop: ah.swapFirstRowTopInsetPx,
    paddingHorizontal: contentInset,
  };

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
        minHeight: 0,
      }}
      onLayout={onViewportLayout}
    >
      <HspScrollColumn
        style={{ flex: 1, ...scrollShellBleed }}
        onMetricsChange={onScrollMetrics}
        contentContainerStyle={
          scrollLayoutReady && !needsScroll
            ? {
                ...scrollContentPadding,
                flexGrow: 1,
                ...(viewportH > 0 ? { minHeight: viewportH } : {}),
              }
            : scrollContentPadding
        }
      >
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
            marginTop: layout.authenticatedHome.swapChartTopGapPx,
            minHeight: SWAP_CHART_BLOCK_MIN_HEIGHT_PX,
            ...(scrollLayoutReady && !needsScroll ? { flex: 1 } : null),
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
            expandToFill={scrollLayoutReady && !needsScroll}
          />
        </View>
        <SwapFormBelowChart effectiveTonPriceUsd={displayTonPriceUsd} />
      </HspScrollColumn>
    </View>
  );
}
