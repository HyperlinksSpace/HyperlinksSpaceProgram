import type { AppLocale } from "../../locales/appStrings";
import type { ChooseCurrencyRow } from "../components/swap/chooseCurrencyTableTypes";
import { parseLocaleAmount } from "../format/localeAmountFormat";

export function compareChooseCurrencyRowsByMarketCap(
  a: ChooseCurrencyRow,
  b: ChooseCurrencyRow,
): number {
  const delta = b.marketCapUsd - a.marketCapUsd;
  if (delta !== 0) return delta;
  return a.currency.ticker.localeCompare(b.currency.ticker);
}

export function sortChooseCurrencyRowsByMarketCap(
  rows: readonly ChooseCurrencyRow[],
): ChooseCurrencyRow[] {
  return [...rows].sort(compareChooseCurrencyRowsByMarketCap);
}

/** Non-zero on-chain / account balance shown in the balance column. */
export function chooseCurrencyRowHasWalletBalance(
  row: ChooseCurrencyRow,
  locale: AppLocale,
): boolean {
  if (row.balance === "—") return false;
  const amount = parseLocaleAmount(row.balance, locale) ?? 0;
  return Number.isFinite(amount) && amount > 0;
}

export type ChooseCurrencyWalletPartition = {
  walletAvailable: readonly ChooseCurrencyRow[];
  rest: readonly ChooseCurrencyRow[];
};

export function partitionChooseCurrencyRowsForWalletFirst(
  rows: readonly ChooseCurrencyRow[],
  locale: AppLocale,
): ChooseCurrencyWalletPartition {
  const wallet: ChooseCurrencyRow[] = [];
  const rest: ChooseCurrencyRow[] = [];
  for (const row of rows) {
    if (chooseCurrencyRowHasWalletBalance(row, locale)) wallet.push(row);
    else rest.push(row);
  }
  return {
    walletAvailable: sortChooseCurrencyRowsByMarketCap(wallet),
    rest: sortChooseCurrencyRowsByMarketCap(rest),
  };
}
