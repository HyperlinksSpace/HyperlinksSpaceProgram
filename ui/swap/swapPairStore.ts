import { useSyncExternalStore } from "react";

import type { SwapCurrencySide } from "./swapCurrencyPicker";
import {
  SWAP_DEFAULT_DLLR_SELL_AMOUNT,
  type SwapBasisField,
} from "./estimateDllrPairAmounts";
import { computeSwapPairAfterRotate } from "./swapRotateBasis";
import {
  SWAP_DLLR_TOKEN,
  SWAP_GRAM_TOKEN,
  isDllrSellPair,
  type SwapPairToken,
  type SwapQuoteDirection,
} from "./swapPairTypes";

export type SwapPairState = {
  sellToken: SwapPairToken;
  buyToken: SwapPairToken;
  sellAmount: string;
  buyAmount: string;
  /** Which field the user last edited. */
  quoteDirection: SwapQuoteDirection;
  /** Which row holds the basis amount (whatswap basisFieldRef). */
  basisField: SwapBasisField;
  /** Preserved basis amount moved on rotate (whatswap originalBasisValueRef). */
  basisValue: string;
  /** Last successful route meta for the action row. */
  lastQuotedSellAmount: number | null;
  lastQuotedBuyAmount: number | null;
  quoteError: string | null;
  isQuoting: boolean;
};

const listeners = new Set<() => void>();

let state: SwapPairState = {
  sellToken: SWAP_DLLR_TOKEN,
  buyToken: SWAP_GRAM_TOKEN,
  sellAmount: SWAP_DEFAULT_DLLR_SELL_AMOUNT,
  buyAmount: "",
  quoteDirection: "exact_in",
  basisField: "sell",
  basisValue: SWAP_DEFAULT_DLLR_SELL_AMOUNT,
  lastQuotedSellAmount: null,
  lastQuotedBuyAmount: null,
  quoteError: null,
  isQuoting: false,
};

function dllrSellBaselinePatch(
  sellToken: SwapPairToken,
  buyToken: SwapPairToken,
): Partial<SwapPairState> {
  if (!isDllrSellPair(sellToken, buyToken)) return {};
  return {
    sellAmount: SWAP_DEFAULT_DLLR_SELL_AMOUNT,
    buyAmount: "",
    quoteDirection: "exact_in",
    basisField: "sell",
    basisValue: SWAP_DEFAULT_DLLR_SELL_AMOUNT,
    lastQuotedSellAmount: null,
    lastQuotedBuyAmount: null,
    quoteError: null,
  };
}

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<SwapPairState>) {
  state = { ...state, ...patch };
  emit();
}

export function getSwapPairState(): SwapPairState {
  return state;
}

export function subscribeSwapPair(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSwapPairState(): SwapPairState {
  return useSyncExternalStore(subscribeSwapPair, getSwapPairState, getSwapPairState);
}

export function setSwapSellAmount(amount: string) {
  const trimmed = amount.trim();
  setState({
    sellAmount: amount,
    quoteDirection: "exact_in",
    basisField: "sell",
    ...(trimmed ? { basisValue: trimmed } : {}),
  });
}

export function setSwapBuyAmount(amount: string) {
  const trimmed = amount.trim();
  setState({
    buyAmount: amount,
    quoteDirection: "exact_out",
    basisField: "buy",
    ...(trimmed ? { basisValue: trimmed } : {}),
  });
}

export function setSwapQuoteResult(opts: {
  sellAmount: string;
  buyAmount: string;
  sellNumeric: number | null;
  buyNumeric: number | null;
  error: string | null;
  isQuoting: boolean;
}) {
  setState({
    sellAmount: opts.sellAmount,
    buyAmount: opts.buyAmount,
    lastQuotedSellAmount: opts.sellNumeric,
    lastQuotedBuyAmount: opts.buyNumeric,
    quoteError: opts.error,
    isQuoting: opts.isQuoting,
  });
}

export function setSwapQuoting(isQuoting: boolean) {
  if (state.isQuoting === isQuoting) return;
  setState({ isQuoting });
}

export function setSwapTokenForSide(side: SwapCurrencySide, token: SwapPairToken) {
  if (side === "sell") {
    const sameAsBuy =
      token.address.toLowerCase() === state.buyToken.address.toLowerCase() &&
      Boolean(token.isNative) === Boolean(state.buyToken.isNative);
    if (sameAsBuy) {
      const sellToken = token;
      const buyToken = state.sellToken;
      setState({
        sellToken,
        buyToken,
        ...dllrSellBaselinePatch(sellToken, buyToken),
      });
      return;
    }
    const sellToken = token;
    const buyToken = state.buyToken;
    setState({
      sellToken,
      ...dllrSellBaselinePatch(sellToken, buyToken),
    });
    return;
  }
  const sameAsSell =
    token.address.toLowerCase() === state.sellToken.address.toLowerCase() &&
    Boolean(token.isNative) === Boolean(state.sellToken.isNative);
  if (sameAsSell) {
    const buyToken = token;
    const sellToken = state.buyToken;
    setState({
      buyToken,
      sellToken,
      ...dllrSellBaselinePatch(sellToken, buyToken),
    });
    return;
  }
  const buyToken = token;
  const sellToken = state.sellToken;
  setState({
    buyToken,
    ...dllrSellBaselinePatch(sellToken, buyToken),
  });
}

/**
 * Currencies-home selection: buy `token` for Dollar (DLLR). Picking DLLR itself
 * opens the default DLLR → Gram pair.
 */
export function selectSwapBuyTokenForDllr(token: SwapPairToken) {
  const isDllr =
    token.address.toLowerCase() === SWAP_DLLR_TOKEN.address.toLowerCase() ||
    token.symbol.trim().toUpperCase() === "DLLR";
  const sellToken = SWAP_DLLR_TOKEN;
  const buyToken = isDllr ? SWAP_GRAM_TOKEN : token;
  setState({
    sellToken,
    buyToken,
    ...dllrSellBaselinePatch(sellToken, buyToken),
  });
}

/** whatswap rotate: basis value moves Sell ↔ Buy; opposite side is re-quoted. */
export function rotateSwapPair() {
  const next = computeSwapPairAfterRotate(state);
  setState(next);
}
