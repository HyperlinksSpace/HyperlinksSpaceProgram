import { describe, expect, it } from "vitest";

import { SWAP_DEFAULT_DLLR_SELL_AMOUNT } from "../estimateDllrPairAmounts";
import { computeSwapPairAfterRotate } from "../swapRotateBasis";
import type { SwapPairToken } from "../swapPairTypes";

const SWAP_DLLR_TOKEN: SwapPairToken = {
  address: "jetton:dllr",
  symbol: "DLLR",
  name: "Dollar",
  decimals: 9,
};

const SWAP_GRAM_TOKEN: SwapPairToken = {
  address: "0:0000000000000000000000000000000000000000000000000000000000000000",
  symbol: "GRAM",
  name: "Gram",
  decimals: 9,
  isNative: true,
};

const dllrGramSellBasis = {
  sellToken: SWAP_DLLR_TOKEN,
  buyToken: SWAP_GRAM_TOKEN,
  sellAmount: SWAP_DEFAULT_DLLR_SELL_AMOUNT,
  buyAmount: "0.42",
  quoteDirection: "exact_in" as const,
  basisField: "sell" as const,
  basisValue: SWAP_DEFAULT_DLLR_SELL_AMOUNT,
};

describe("computeSwapPairAfterRotate", () => {
  it("moves basis 1 from Sell down to Buy on first rotate", () => {
    const next = computeSwapPairAfterRotate(dllrGramSellBasis);
    expect(next.sellToken.symbol).toBe("GRAM");
    expect(next.buyToken.symbol).toBe("DLLR");
    expect(next.sellAmount).toBe("");
    expect(next.buyAmount).toBe("1");
    expect(next.basisField).toBe("buy");
    expect(next.quoteDirection).toBe("exact_out");
  });

  it("moves basis 1 from Buy back up to Sell on second rotate", () => {
    const once = computeSwapPairAfterRotate(dllrGramSellBasis);
    const twice = computeSwapPairAfterRotate(once);
    expect(twice.sellToken.symbol).toBe("DLLR");
    expect(twice.buyToken.symbol).toBe("GRAM");
    expect(twice.sellAmount).toBe("1");
    expect(twice.buyAmount).toBe("");
    expect(twice.basisField).toBe("sell");
    expect(twice.quoteDirection).toBe("exact_in");
  });
});
