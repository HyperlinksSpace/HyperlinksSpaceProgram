/** Native TON jetton address for Dyor chart + Swap.Coffee tokens API. */
export const TON_JETTON_ADDRESS =
  "0:0000000000000000000000000000000000000000000000000000000000000000";

export const DYOR_CHART_API_BASE = "https://api.dyor.io";
export const SWAP_COFFEE_TOKENS_API_BASE =
  process.env.EXPO_PUBLIC_COFFEE_TOKENS_BASE_URL?.trim() || "https://tokens.swap.coffee";

export type SwapIntervalKey = "m" | "q" | "h" | "d";

export type SwapChartResolution = "day1" | "hour1" | "min15" | "min1";

export const SWAP_INTERVAL_TO_RESOLUTION: Record<SwapIntervalKey, SwapChartResolution> = {
  d: "day1",
  h: "hour1",
  q: "min15",
  m: "min1",
};

/** prev-main `_resolutionOrder` (swipe indexing). */
export const SWAP_RESOLUTION_ORDER: SwapIntervalKey[] = ["d", "h", "q", "m"];

/** UI letter order left-to-right on the rate row (prev-main `d h q m`). */
export const SWAP_INTERVAL_UI_ORDER: SwapIntervalKey[] = ["d", "h", "q", "m"];

export const SWAP_RESOLUTION_SWIPE_VELOCITY_THRESHOLD = 200;
export const SWAP_EDGE_SWIPE_GUARD_WIDTH_PX = 56;

export function stepSwapIntervalKey(
  current: SwapIntervalKey,
  direction: "finer" | "coarser",
): SwapIntervalKey {
  const idx = SWAP_INTERVAL_UI_ORDER.indexOf(current);
  if (idx < 0) return current;
  if (direction === "finer" && idx < SWAP_INTERVAL_UI_ORDER.length - 1) {
    return SWAP_INTERVAL_UI_ORDER[idx + 1]!;
  }
  if (direction === "coarser" && idx > 0) return SWAP_INTERVAL_UI_ORDER[idx - 1]!;
  return current;
}

export const SWAP_MAX_TIME_RANGE_DAYS: Record<SwapChartResolution, number> = {
  day1: 365,
  hour1: 30,
  min15: 7,
  min1: 1,
};

export const CHART_RATE_LIMIT_MS = 1000;
export const CHART_MAX_RETRIES = 5;

/** Gap between chart line area and timestamp row (prev-main). */
export const SWAP_CHART_TIMESTAMP_GAP_PX = 5;
export const SWAP_CHART_TIMESTAMP_ROW_HEIGHT_PX = 15;
/** Minimum drawable height for the price line (not including timestamps). */
export const SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX = 55;
export const SWAP_CHART_BLOCK_MIN_HEIGHT_PX =
  SWAP_CHART_LINE_AREA_MIN_HEIGHT_PX +
  SWAP_CHART_TIMESTAMP_GAP_PX +
  SWAP_CHART_TIMESTAMP_ROW_HEIGHT_PX;
