import type { SwapChartResolution } from "./swapChartConstants";

export type SwapChartPoint = {
  price: number;
  timestamp: Date;
};

/** Up to 5 decimal places, trailing zeros stripped (matches prev-main). */
/** Token amount display (up to 6 decimals, trailing zeros stripped; prev-main). */
export function formatSwapTokenAmount(amount: number): string {
  const formatted = amount.toFixed(6);
  if (formatted.includes(".")) {
    return formatted.replace(/0+$/, "").replace(/\.$/, "");
  }
  return formatted;
}

export function formatSwapPrice(price: number): string {
  const formatted = price.toFixed(5);
  if (formatted.includes(".")) {
    return formatted.replace(/0+$/, "").replace(/\.$/, "");
  }
  return formatted;
}

export function formatSwapNumber(value: number | null | undefined, isCurrency = false): string {
  if (value == null || !Number.isFinite(value)) return "...";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return isCurrency ? `${millions.toFixed(1)}M$` : `${millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return isCurrency ? `${thousands.toFixed(1)}K$` : `${thousands.toFixed(1)}K`;
  }
  return isCurrency ? `${value.toFixed(0)}$` : value.toFixed(0);
}

export function formatSwapPercentage(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "...";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function resolutionLabel(resolution: SwapChartResolution): string {
  switch (resolution) {
    case "day1":
      return "(Day)";
    case "hour1":
      return "(Hour)";
    case "min15":
      return "(15m)";
    case "min1":
      return "(1m)";
    default:
      return "";
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatChartTimestamp(
  timestamp: Date | null | undefined,
  resolution: SwapChartResolution,
  firstTimestamp: Date | null,
  lastTimestamp: Date | null,
): string {
  if (!timestamp) return "--/--";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tsDate = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());

  if (firstTimestamp && lastTimestamp && isSameMinute(timestamp, firstTimestamp)) {
    if (resolution === "day1") {
      const oneYearAgo = new Date(
        lastTimestamp.getFullYear() - 1,
        lastTimestamp.getMonth(),
        lastTimestamp.getDate(),
      );
      const firstDate = new Date(
        firstTimestamp.getFullYear(),
        firstTimestamp.getMonth(),
        firstTimestamp.getDate(),
      );
      if (
        firstDate.getFullYear() === oneYearAgo.getFullYear() &&
        firstDate.getMonth() === oneYearAgo.getMonth() &&
        firstDate.getDate() === oneYearAgo.getDate()
      ) {
        return "A Year Ago";
      }
    } else if (resolution === "hour1") {
      const lastDate = new Date(
        lastTimestamp.getFullYear(),
        lastTimestamp.getMonth(),
        lastTimestamp.getDate(),
      );
      const oneMonthAgo =
        lastDate.getMonth() === 0
          ? new Date(lastDate.getFullYear() - 1, 11, lastDate.getDate())
          : new Date(lastDate.getFullYear(), lastDate.getMonth() - 1, lastDate.getDate());
      const firstDate = new Date(
        firstTimestamp.getFullYear(),
        firstTimestamp.getMonth(),
        firstTimestamp.getDate(),
      );
      if (
        firstDate.getFullYear() === oneMonthAgo.getFullYear() &&
        firstDate.getMonth() === oneMonthAgo.getMonth() &&
        firstDate.getDate() === oneMonthAgo.getDate()
      ) {
        return "A Month Ago";
      }
    }
  }

  switch (resolution) {
    case "day1":
      return `${pad2(timestamp.getDate())}/${pad2(timestamp.getMonth() + 1)}/${timestamp.getFullYear().toString().slice(2)}`;
    case "hour1":
      return `${pad2(timestamp.getDate())}/${pad2(timestamp.getMonth() + 1)}`;
    case "min15":
      return `${pad2(timestamp.getDate())}/${pad2(timestamp.getMonth() + 1)} ${pad2(timestamp.getHours())}:${pad2(timestamp.getMinutes())}`;
    case "min1": {
      const timeStr = `${pad2(timestamp.getHours())}:${pad2(timestamp.getMinutes())}`;
      if (tsDate.getTime() === today.getTime()) return `${timeStr}, Today`;
      if (tsDate.getTime() === yesterday.getTime()) return `${timeStr}, Yesterday`;
      return `${timeStr}, ${pad2(timestamp.getDate())}/${pad2(timestamp.getMonth() + 1)}`;
    }
    default:
      return "--/--";
  }
}

function isSameMinute(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}

export function maxPriceColumnWidth(
  points: SwapChartPoint[] | null,
  minPrice: number | null,
  maxPrice: number | null,
): number {
  let maxWidth = 0;
  const measure = (text: string) => Math.max(28, text.length * 6.2);

  if (points) {
    for (const p of points) {
      maxWidth = Math.max(maxWidth, measure(formatSwapPrice(p.price)));
    }
  }
  if (minPrice != null) maxWidth = Math.max(maxWidth, measure(formatSwapPrice(minPrice)));
  if (maxPrice != null) maxWidth = Math.max(maxWidth, measure(formatSwapPrice(maxPrice)));

  return Math.ceil(maxWidth);
}
