import { describe, expect, it } from "vitest";

import {
  quoteDllrSellPairFromChartPrice,
  quoteLedgerDllrChartPair,
  SWAP_DEFAULT_DLLR_SELL_AMOUNT,
} from "../estimateDllrPairAmounts";

describe("quoteDllrSellPairFromChartPrice", () => {
  it("converts 1 DLLR to buy tokens via chart USD price", () => {
    const result = quoteDllrSellPairFromChartPrice({
      sellAmount: Number(SWAP_DEFAULT_DLLR_SELL_AMOUNT),
      buyAmount: 0,
      direction: "exact_in",
      chartPriceUsdPerBuyToken: 2,
    });
    expect(result).toEqual({ sellAmount: 1, buyAmount: 0.5 });
  });

  it("converts exact-out buy amount to DLLR sell", () => {
    const result = quoteDllrSellPairFromChartPrice({
      sellAmount: 0,
      buyAmount: 0.5,
      direction: "exact_out",
      chartPriceUsdPerBuyToken: 2,
    });
    expect(result).toEqual({ sellAmount: 1, buyAmount: 0.5 });
  });

  it("converts exact-out DLLR buy to chart sell after rotate", () => {
    const result = quoteLedgerDllrChartPair({
      dllrOnSellSide: false,
      direction: "exact_out",
      sellAmount: 0,
      buyAmount: 1,
      chartPriceUsdPerChartToken: 2,
    });
    expect(result).toEqual({ sellAmount: 0.5, buyAmount: 1 });
  });
});
