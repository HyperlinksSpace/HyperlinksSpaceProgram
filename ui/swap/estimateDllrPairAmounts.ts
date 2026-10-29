import type { SwapQuoteDirection } from "./swapPairTypes";

/** Default basis amount (whatswap originalBasisValue — typically 1). */
export const SWAP_DEFAULT_DLLR_SELL_AMOUNT = "1";

export type SwapBasisField = "sell" | "buy";

/**
 * Chart-priced ledger DLLR ↔ chart asset (1 DLLR ≈ 1 USD).
 * `chartPriceUsdPerChartToken` is USD per unit of the non-DLLR chart token.
 */
export function quoteLedgerDllrChartPair(opts: {
  dllrOnSellSide: boolean;
  direction: SwapQuoteDirection;
  sellAmount: number;
  buyAmount: number;
  chartPriceUsdPerChartToken: number;
}): { sellAmount: number; buyAmount: number } | null {
  const price = opts.chartPriceUsdPerChartToken;
  if (!(price > 0) || !Number.isFinite(price)) return null;

  if (opts.dllrOnSellSide) {
    if (opts.direction === "exact_in") {
      if (!(opts.sellAmount > 0) || !Number.isFinite(opts.sellAmount)) return null;
      return {
        sellAmount: opts.sellAmount,
        buyAmount: opts.sellAmount / price,
      };
    }
    if (!(opts.buyAmount > 0) || !Number.isFinite(opts.buyAmount)) return null;
    return {
      sellAmount: opts.buyAmount * price,
      buyAmount: opts.buyAmount,
    };
  }

  // Chart asset on sell, DLLR on buy.
  if (opts.direction === "exact_in") {
    if (!(opts.sellAmount > 0) || !Number.isFinite(opts.sellAmount)) return null;
    return {
      sellAmount: opts.sellAmount,
      buyAmount: opts.sellAmount * price,
    };
  }
  if (!(opts.buyAmount > 0) || !Number.isFinite(opts.buyAmount)) return null;
  return {
    sellAmount: opts.buyAmount / price,
    buyAmount: opts.buyAmount,
  };
}

/** @deprecated Use {@link quoteLedgerDllrChartPair}. */
export function quoteDllrSellPairFromChartPrice(opts: {
  sellAmount: number;
  buyAmount: number;
  direction: SwapQuoteDirection;
  chartPriceUsdPerBuyToken: number;
}): { sellAmount: number; buyAmount: number } | null {
  return quoteLedgerDllrChartPair({
    dllrOnSellSide: true,
    direction: opts.direction,
    sellAmount: opts.sellAmount,
    buyAmount: opts.buyAmount,
    chartPriceUsdPerChartToken: opts.chartPriceUsdPerBuyToken,
  });
}
