import { useCallback, useEffect, useRef, useState } from "react";
import {
  SWAP_INTERVAL_TO_RESOLUTION,
  type SwapChartResolution,
  type SwapIntervalKey,
} from "./swapChartConstants";
import {
  chartMaxRetries,
  chartRetryDelayMs,
  fetchSwapChartSeries,
  fetchSwapMarketStats,
  type NormalizedChartSeries,
  type SwapMarketStats,
} from "./fetchSwapChart";

export function useSwapChart(initialInterval: SwapIntervalKey = "m") {
  const [intervalKey, setIntervalKey] = useState<SwapIntervalKey>(initialInterval);
  const resolution = SWAP_INTERVAL_TO_RESOLUTION[intervalKey];

  const [series, setSeries] = useState<NormalizedChartSeries | null>(null);
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [marketStats, setMarketStats] = useState<SwapMarketStats | null>(null);

  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadChart = useCallback(
    async (isRetry: boolean) => {
      if (!isRetry) {
        setIsLoadingChart(true);
        setChartError(null);
        retryCountRef.current = 0;
      }

      const result = await fetchSwapChartSeries(resolution);
      if (!mountedRef.current) return;

      if (result.ok) {
        setSeries(result.series);
        setSelectedPointIndex(null);
        setIsLoadingChart(false);
        setChartError(null);
        retryCountRef.current = 0;
        return;
      }

      if (result.retryable && retryCountRef.current < chartMaxRetries()) {
        retryCountRef.current += 1;
        const delay = chartRetryDelayMs(retryCountRef.current);
        setChartError(`${result.error} Retrying in ${Math.round(delay / 1000)}s…`);
        setTimeout(() => {
          if (mountedRef.current) void loadChart(true);
        }, delay);
        return;
      }

      setSeries(null);
      setIsLoadingChart(false);
      setChartError(
        retryCountRef.current >= chartMaxRetries()
          ? `Failed to load chart after ${chartMaxRetries()} attempts. Please try again later.`
          : result.error,
      );
    },
    [resolution],
  );

  useEffect(() => {
    void loadChart(false);
  }, [loadChart]);

  useEffect(() => {
    void fetchSwapMarketStats().then((stats) => {
      if (mountedRef.current) setMarketStats(stats);
    });
  }, []);

  const effectiveTonPriceUsd =
    series?.points.length && series.points[series.points.length - 1]
      ? series.points[series.points.length - 1]!.price
      : marketStats?.priceUsd ?? null;

  return {
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
    reloadChart: () => loadChart(false),
  };
}
