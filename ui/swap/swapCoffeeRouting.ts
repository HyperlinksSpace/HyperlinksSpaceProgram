import { RoutingApi, type ApiTokenAddress } from "@swap-coffee/sdk";

import {
  isDllrToken,
  isNativeTonToken,
  SWAP_USDT_TOKEN,
  type SwapPairToken,
  type SwapQuoteDirection,
} from "./swapPairTypes";

const routingApi = new RoutingApi();

export function toApiTokenAddress(token: SwapPairToken): ApiTokenAddress {
  if (isNativeTonToken(token)) {
    return { blockchain: "ton", address: "native" };
  }
  return { blockchain: "ton", address: token.address };
}

/** Ledger DLLR is quoted like USDT at 1:1 (frozen; display/route only). */
export function usdtStandInForDllr(token: SwapPairToken): SwapPairToken {
  return isDllrToken(token) ? SWAP_USDT_TOKEN : token;
}

export type SwapRouteQuote = {
  inputAmount: number;
  outputAmount: number;
  paths: unknown;
  priceImpact?: number | null;
  recommendedGas?: number | null;
};

export async function buildSwapRouteQuote(opts: {
  sellToken: SwapPairToken;
  buyToken: SwapPairToken;
  amount: number;
  direction: SwapQuoteDirection;
}): Promise<SwapRouteQuote> {
  const input_token = toApiTokenAddress(opts.sellToken);
  const output_token = toApiTokenAddress(opts.buyToken);
  if (
    input_token.address === output_token.address &&
    input_token.blockchain === output_token.blockchain
  ) {
    throw new Error("same_token");
  }
  if (!(opts.amount > 0) || !Number.isFinite(opts.amount)) {
    throw new Error("invalid_amount");
  }

  const route =
    opts.direction === "exact_out"
      ? await routingApi.buildRoute({
          input_token,
          output_token,
          output_amount: opts.amount,
          max_splits: 4,
        })
      : await routingApi.buildRoute({
          input_token,
          output_token,
          input_amount: opts.amount,
          max_splits: 4,
        });

  const data = route.data as {
    input_amount?: number | string;
    output_amount?: number | string;
    paths?: unknown;
    price_impact?: number;
    recommended_gas?: number;
  } | null;
  if (!data) {
    throw new Error("no_route");
  }

  const inputAmount = Number(data.input_amount);
  const outputAmount = Number(data.output_amount);
  if (!Number.isFinite(inputAmount) || !Number.isFinite(outputAmount)) {
    throw new Error("invalid_route_amounts");
  }

  return {
    inputAmount,
    outputAmount,
    paths: data.paths,
    priceImpact:
      typeof data.price_impact === "number" ? data.price_impact : null,
    recommendedGas:
      typeof data.recommended_gas === "number" ? data.recommended_gas : null,
  };
}

/** Swap.Coffee route with each DLLR leg replaced by USDT (same size). */
export async function buildSwapRouteQuoteDllrAsUsdt(opts: {
  sellToken: SwapPairToken;
  buyToken: SwapPairToken;
  amount: number;
  direction: SwapQuoteDirection;
}): Promise<SwapRouteQuote> {
  const sellToken = usdtStandInForDllr(opts.sellToken);
  const buyToken = usdtStandInForDllr(opts.buyToken);
  return buildSwapRouteQuote({
    sellToken,
    buyToken,
    amount: opts.amount,
    direction: opts.direction,
  });
}

export { routingApi as swapCoffeeRoutingApi };
