import { fetchSwapChartSeries, type NormalizedChartSeries } from "./fetchSwapChart";
import type { SwapChartResolution } from "./swapChartConstants";

type ChartResult =
  | { ok: true; series: NormalizedChartSeries }
  | { ok: false; error: string; retryable: boolean };

const seriesCache = new Map<SwapChartResolution, NormalizedChartSeries>();
let inFlightKey: SwapChartResolution | null = null;
let inFlightPromise: Promise<ChartResult> | null = null;

/** Dedupes Dyor fetches across SwapPanel remounts (resize / breakpoint) and caches by resolution. */
export async function loadSwapChartSeriesCached(resolution: SwapChartResolution): Promise<ChartResult> {
  const cached = seriesCache.get(resolution);
  if (cached) {
    return { ok: true, series: cached };
  }

  if (inFlightPromise && inFlightKey === resolution) {
    return inFlightPromise;
  }

  inFlightKey = resolution;
  inFlightPromise = fetchSwapChartSeries(resolution).then((result) => {
    inFlightPromise = null;
    inFlightKey = null;
    if (result.ok) {
      seriesCache.set(resolution, result.series);
    }
    return result;
  });

  return inFlightPromise;
}

export function peekSwapChartSeriesCache(
  resolution: SwapChartResolution,
): NormalizedChartSeries | null {
  return seriesCache.get(resolution) ?? null;
}
