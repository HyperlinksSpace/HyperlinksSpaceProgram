import {
  CHART_MAX_RETRIES,
  CHART_RATE_LIMIT_MS,
  DYOR_CHART_API_BASE,
  SWAP_COFFEE_TOKENS_API_BASE,
  SWAP_MAX_TIME_RANGE_DAYS,
  TON_JETTON_ADDRESS,
  type SwapChartResolution,
} from "./swapChartConstants";
import type { SwapChartPoint } from "./swapChartFormat";

export type SwapMarketStats = {
  priceUsd: number | null;
  mcap: number | null;
  fdmc: number | null;
  volume24h: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
};

export type NormalizedChartSeries = {
  points: SwapChartPoint[];
  normalized: number[];
  minPrice: number;
  maxPrice: number;
  firstTimestamp: Date | null;
  lastTimestamp: Date | null;
};

let lastChartApiCallMs = 0;

async function respectChartRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastChartApiCallMs;
  if (elapsed < CHART_RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, CHART_RATE_LIMIT_MS - elapsed));
  }
  lastChartApiCallMs = Date.now();
}

function getTimeRange(resolution: SwapChartResolution): { from: string; to: string } {
  const now = new Date();
  const maxDays = SWAP_MAX_TIME_RANGE_DAYS[resolution] ?? 30;
  const from = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

function parseChartPoints(raw: unknown): SwapChartPoint[] {
  if (!raw || typeof raw !== "object") return [];
  const points = (raw as { points?: unknown }).points;
  if (!Array.isArray(points)) return [];

  const out: SwapChartPoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== "object") continue;
    const valueObj = (point as { value?: unknown }).value;
    const timeStr = (point as { time?: unknown }).time;
    if (!valueObj || typeof valueObj !== "object" || typeof timeStr !== "string") continue;

    const valueStr = (valueObj as { value?: unknown }).value;
    const decimals = (valueObj as { decimals?: unknown }).decimals;
    if (typeof valueStr !== "string" || typeof decimals !== "number") continue;

    const value = Number.parseInt(valueStr, 10);
    if (!Number.isFinite(value)) continue;
    const realValue = value * 10 ** -decimals;

    const timestamp = new Date(timeStr);
    if (Number.isNaN(timestamp.getTime())) continue;

    out.push({ price: realValue, timestamp });
  }

  return out.reverse();
}

export function normalizeChartSeries(points: SwapChartPoint[]): NormalizedChartSeries | null {
  if (points.length === 0) return null;

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;

  const normalized =
    range > 0
      ? prices.map((price) => (price - minPrice) / range)
      : prices.map(() => 0.5);

  return {
    points,
    normalized,
    minPrice,
    maxPrice,
    firstTimestamp: points[0]?.timestamp ?? null,
    lastTimestamp: points[points.length - 1]?.timestamp ?? null,
  };
}

export async function fetchSwapChartSeries(
  resolution: SwapChartResolution,
): Promise<{ ok: true; series: NormalizedChartSeries } | { ok: false; error: string; retryable: boolean }> {
  await respectChartRateLimit();

  const timeRange = getTimeRange(resolution);
  const url = new URL(`${DYOR_CHART_API_BASE}/v1/jettons/${TON_JETTON_ADDRESS}/price/chart`);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("currency", "usd");
  url.searchParams.set("from", timeRange.from);
  url.searchParams.set("to", timeRange.to);

  try {
    const response = await fetch(url.toString());
    if (response.status === 429) {
      return { ok: false, error: "Rate limit exceeded. Retrying…", retryable: true };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: `Failed to load chart (${response.status})`,
        retryable: response.status >= 500,
      };
    }

    const data = await response.json();
    const parsed = parseChartPoints(data);
    if (parsed.length === 0) {
      return { ok: false, error: "No price data available", retryable: false };
    }

    const series = normalizeChartSeries(parsed);
    if (!series) {
      return { ok: false, error: "No price data available", retryable: false };
    }

    return { ok: true, series };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Network error: ${message}`, retryable: true };
  }
}

export async function fetchSwapMarketStats(): Promise<SwapMarketStats> {
  const empty: SwapMarketStats = {
    priceUsd: null,
    mcap: null,
    fdmc: null,
    volume24h: null,
    priceChange5m: null,
    priceChange1h: null,
    priceChange6h: null,
    priceChange24h: null,
  };

  try {
    const url = `${SWAP_COFFEE_TOKENS_API_BASE.replace(/\/$/, "")}/api/v3/jettons/${encodeURIComponent(TON_JETTON_ADDRESS)}`;
    const response = await fetch(url);
    if (!response.ok) return empty;

    const data = await response.json();
    const marketStats =
      data && typeof data === "object" ? (data as { market_stats?: unknown }).market_stats : null;
    if (!marketStats || typeof marketStats !== "object") return empty;

    const m = marketStats as Record<string, unknown>;
    const num = (k: string) => {
      const v = m[k];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };

    return {
      priceUsd: num("price_usd"),
      mcap: num("mcap"),
      fdmc: num("fdmc"),
      volume24h: num("volume_usd_24h"),
      priceChange5m: num("price_change_5m"),
      priceChange1h: num("price_change_1h"),
      priceChange6h: num("price_change_6h"),
      priceChange24h: num("price_change_24h"),
    };
  } catch {
    return empty;
  }
}

export function chartRetryDelayMs(attempt: number): number {
  return 2 ** Math.max(0, attempt - 1) * 1000;
}

export function chartMaxRetries(): number {
  return CHART_MAX_RETRIES;
}
