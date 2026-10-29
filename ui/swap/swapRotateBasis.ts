import { SWAP_DEFAULT_DLLR_SELL_AMOUNT, type SwapBasisField } from "./estimateDllrPairAmounts";
import type { SwapPairToken, SwapQuoteDirection } from "./swapPairTypes";

export type SwapPairRotateInput = {
  sellToken: SwapPairToken;
  buyToken: SwapPairToken;
  sellAmount: string;
  buyAmount: string;
  quoteDirection: SwapQuoteDirection;
  basisField: SwapBasisField;
  basisValue: string;
};

export type SwapPairRotateResult = SwapPairRotateInput & {
  lastQuotedSellAmount: null;
  lastQuotedBuyAmount: null;
  quoteError: null;
};

/**
 * whatswap rotation: swap tokens and move the basis amount to the opposite row.
 * Sell → Buy on first rotate; Buy → Sell on the next.
 */
export function computeSwapPairAfterRotate(
  input: SwapPairRotateInput,
): SwapPairRotateResult {
  const nextSell = input.buyToken;
  const nextBuy = input.sellToken;
  const valueToTransfer = resolveRotateTransferValue(input);

  if (input.basisField === "sell") {
    return {
      sellToken: nextSell,
      buyToken: nextBuy,
      sellAmount: "",
      buyAmount: valueToTransfer,
      quoteDirection: "exact_out",
      basisField: "buy",
      basisValue: input.basisValue,
      lastQuotedSellAmount: null,
      lastQuotedBuyAmount: null,
      quoteError: null,
    };
  }

  return {
    sellToken: nextSell,
    buyToken: nextBuy,
    sellAmount: valueToTransfer,
    buyAmount: "",
    quoteDirection: "exact_in",
    basisField: "sell",
    basisValue: input.basisValue,
    lastQuotedSellAmount: null,
    lastQuotedBuyAmount: null,
    quoteError: null,
  };
}

function resolveRotateTransferValue(input: SwapPairRotateInput): string {
  if (input.basisField === "sell") {
    const onField = input.sellAmount.trim();
    if (onField) return onField;
  } else {
    const onField = input.buyAmount.trim();
    if (onField) return onField;
  }
  const preserved = input.basisValue.trim();
  if (preserved) return preserved;
  return SWAP_DEFAULT_DLLR_SELL_AMOUNT;
}
