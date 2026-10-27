import type { ChooseCurrencyRow } from "../components/swap/chooseCurrencyTableTypes";

/** Client-side token filter for the choose-currency table (name + ticker). */
export function filterChooseCurrencyRows(
  rows: readonly ChooseCurrencyRow[],
  query: string,
): ChooseCurrencyRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => {
    const ticker = row.currency.ticker.toLowerCase();
    const name = row.currency.name.toLowerCase();
    return ticker.includes(q) || name.includes(q);
  });
}
