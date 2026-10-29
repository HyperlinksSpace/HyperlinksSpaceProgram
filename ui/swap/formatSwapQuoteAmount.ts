/** Display formatting for routed opposite-side amounts (matches useSwapQuote). */
export function formatSwapQuoteAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n >= 1_000_000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
  return n.toFixed(6).replace(/\.?0+$/, "");
}
