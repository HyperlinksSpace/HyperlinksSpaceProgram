import type { ImageSource } from "expo-image";

import { swapDllrTokenImage } from "./swapFormAssets";

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
  rank: string;
  currency: {
    name: string;
    ticker: string;
    icon: ImageSource;
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
  "networks",
  "marketCap",
  "volume",
  "lastYear",
] as const;

export const CHOOSE_CURRENCY_COLUMN_PRIORITY: Record<ChooseCurrencyColumnKey, ChooseCurrencyColumnPriority> =
  {
    rank: 1,
    currency: 2,
    balance: 3,
    rate: 4,
    networks: 5,
    marketCap: 6,
    volume: 7,
    lastYear: 8,
  };

/** Placeholder list — first row matches the choose-currency mock. */
export const CHOOSE_CURRENCY_SAMPLE_ROWS: readonly ChooseCurrencyRow[] = [
  {
    rank: "1",
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
  },
] as const;
