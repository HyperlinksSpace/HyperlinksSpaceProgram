import type { ImageSource } from "expo-image";

import { swapDllrTokenImage } from "./swapFormAssets";

export type ChooseCurrencyIconSource = ImageSource | { uri: string };

export type ChooseCurrencyColumnKey =
  | "rank"
  | "currency"
  | "balance"
  | "rate"
  | "networks"
  | "marketCap"
  | "volume"
  | "lastYear";

export type ChooseCurrencyColumnPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ChooseCurrencyRow = {
  /** Stable list key (jetton address). */
  rowKey: string;
  currency: {
    name: string;
    ticker: string;
    icon: ChooseCurrencyIconSource | null;
  };
  balance: string;
  rate: string;
  networks: string;
  marketCap: string;
  volume: string;
  /** Stablecoin rows use a flat horizontal line in the mini chart slot. */
  lastYearKind: "stable";
};

export const CHOOSE_CURRENCY_COLUMN_ORDER: readonly ChooseCurrencyColumnKey[] = [
  "rank",
  "currency",
  "balance",
  "rate",
  "marketCap",
  "networks",
  "volume",
  "lastYear",
] as const;

export const CHOOSE_CURRENCY_COLUMN_PRIORITY: Record<ChooseCurrencyColumnKey, ChooseCurrencyColumnPriority> =
  {
    rank: 1,
    currency: 2,
    balance: 3,
    rate: 4,
    marketCap: 5,
    networks: 6,
    volume: 7,
    lastYear: 8,
  };

/** Hardcoded first row — always pinned at top of the choose-currency list. */
export const CHOOSE_CURRENCY_DLLR_ROW: ChooseCurrencyRow = {
  rowKey: "jetton:dllr",
  currency: {
    name: "Dollar",
    ticker: "DLLR",
    icon: swapDllrTokenImage,
  },
  balance: "1",
  rate: "$1",
  networks: "TON, ETH...",
  marketCap: "16b$+",
  volume: "123m$",
  lastYearKind: "stable",
};

/** Fallback when live API rows are unavailable. */
export const CHOOSE_CURRENCY_SAMPLE_ROWS: readonly ChooseCurrencyRow[] = [CHOOSE_CURRENCY_DLLR_ROW];
