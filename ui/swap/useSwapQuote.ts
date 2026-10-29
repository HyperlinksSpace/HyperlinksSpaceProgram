import { useEffect, useRef } from "react";

import type { SwapPairState } from "./swapPairStore";
import { quoteLedgerDllrChartPair } from "./estimateDllrPairAmounts";
import { formatSwapQuoteAmount } from "./formatSwapQuoteAmount";
import {
  buildSwapRouteQuote,
  buildSwapRouteQuoteDllrAsUsdt,
} from "./swapCoffeeRouting";
import {
  isDllrSellPair,
  pairUsesLedgerDllrChartQuote,
} from "./swapPairTypes";
import {
  getSwapPairState,
  setSwapQuoteResult,
  setSwapQuoting,
  subscribeSwapPair,
  useSwapPairState,
} from "./swapPairStore";

const QUOTE_DEBOUNCE_MS = 350;

function parseAmount(raw: string): number {
  return Number(String(raw).replace(",", ".").trim());
}

function applyRouteQuoteToStore(
  snap: SwapPairState,
  quote: { inputAmount: number; outputAmount: number },
  isQuoting: boolean,
  error: string | null,
): boolean {
  const nextSell =
    snap.quoteDirection === "exact_out"
      ? formatSwapQuoteAmount(quote.inputAmount)
      : snap.sellAmount;
  const nextBuy =
    snap.quoteDirection === "exact_in"
      ? formatSwapQuoteAmount(quote.outputAmount)
      : snap.buyAmount;
  const numericsUnchanged =
    snap.lastQuotedSellAmount === quote.inputAmount &&
    snap.lastQuotedBuyAmount === quote.outputAmount;
  const textUnchanged =
    nextSell === snap.sellAmount && nextBuy === snap.buyAmount;
  if (
    numericsUnchanged &&
    textUnchanged &&
    snap.isQuoting === isQuoting &&
    snap.quoteError === error
  ) {
    return false;
  }
  setSwapQuoteResult({
    sellAmount: nextSell,
    buyAmount: nextBuy,
    sellNumeric: quote.inputAmount,
    buyNumeric: quote.outputAmount,
    error,
    isQuoting,
  });
  return true;
}

function quoteInputKey(snap: SwapPairState): string {
  return [
    snap.sellToken.address,
    snap.sellToken.isNative ? "1" : "0",
    snap.buyToken.address,
    snap.buyToken.isNative ? "1" : "0",
    snap.quoteDirection,
    snap.basisField,
    snap.sellAmount,
    snap.buyAmount,
  ].join("|");
}

function chartQuoteForSnap(
  snap: SwapPairState,
  chartPriceUsdPerChartToken: number,
): { inputAmount: number; outputAmount: number } | null {
  const dllrOnSellSide = isDllrSellPair(snap.sellToken, snap.buyToken);
  if (snap.quoteDirection === "exact_in") {
    const sellInput = parseAmount(snap.sellAmount);
    if (!(sellInput > 0)) return null;
    return quoteLedgerDllrChartPair({
      dllrOnSellSide,
      direction: "exact_in",
      sellAmount: sellInput,
      buyAmount: 0,
      chartPriceUsdPerChartToken,
    });
  }
  const buyInput = parseAmount(snap.buyAmount);
  if (!(buyInput > 0)) return null;
  return quoteLedgerDllrChartPair({
    dllrOnSellSide,
    direction: "exact_out",
    sellAmount: 0,
    buyAmount: buyInput,
    chartPriceUsdPerChartToken,
  });
}

/**
 * Live quotes for the opposite amount field.
 * Ledger DLLR uses Swap.Coffee USDT routes at 1:1; chart is instant fallback.
 */
export function useSwapQuote(chartPriceUsdPerChartToken: number | null): void {
  const pair = useSwapPairState();
  const requestIdRef = useRef(0);
  const lastQuoteInputKeyRef = useRef("");

  useEffect(() => {
    const run = () => {
      const snap = getSwapPairState();
      const inputKey = quoteInputKey(snap);
      const inputChanged = lastQuoteInputKeyRef.current !== inputKey;
      lastQuoteInputKeyRef.current = inputKey;

      if (pairUsesLedgerDllrChartQuote(snap.sellToken, snap.buyToken)) {
        const direction = snap.quoteDirection;
        const amount =
          direction === "exact_out"
            ? parseAmount(snap.buyAmount)
            : parseAmount(snap.sellAmount);

        if (!(amount > 0) || !Number.isFinite(amount)) {
          setSwapQuoteResult({
            sellAmount: snap.sellAmount,
            buyAmount: snap.buyAmount,
            sellNumeric: snap.lastQuotedSellAmount,
            buyNumeric: snap.lastQuotedBuyAmount,
            error: null,
            isQuoting: false,
          });
          return;
        }

        let paintedFromChart = false;
        if (
          chartPriceUsdPerChartToken != null &&
          Number.isFinite(chartPriceUsdPerChartToken) &&
          chartPriceUsdPerChartToken > 0
        ) {
          const chart = chartQuoteForSnap(snap, chartPriceUsdPerChartToken);
          if (chart) {
            paintedFromChart = applyRouteQuoteToStore(snap, chart, false, null);
          }
        }

        if (!inputChanged) {
          return;
        }

        const id = ++requestIdRef.current;
        if (!paintedFromChart) {
          setSwapQuoting(true);
        } else if (snap.isQuoting) {
          setSwapQuoting(false);
        }

        void buildSwapRouteQuoteDllrAsUsdt({
          sellToken: snap.sellToken,
          buyToken: snap.buyToken,
          amount,
          direction,
        })
          .then((quote) => {
            if (id !== requestIdRef.current) return;
            applyRouteQuoteToStore(snap, quote, false, null);
          })
          .catch((err) => {
            if (id !== requestIdRef.current) return;
            const message =
              err instanceof Error ? err.message : "quote_failed";
            if (
              chartPriceUsdPerChartToken != null &&
              Number.isFinite(chartPriceUsdPerChartToken) &&
              chartPriceUsdPerChartToken > 0
            ) {
              const chart = chartQuoteForSnap(snap, chartPriceUsdPerChartToken);
              if (chart) {
                applyRouteQuoteToStore(snap, chart, false, null);
                return;
              }
            }
            setSwapQuoteResult({
              sellAmount: snap.sellAmount,
              buyAmount: snap.buyAmount,
              sellNumeric: null,
              buyNumeric: null,
              error: message,
              isQuoting: false,
            });
          });
        return;
      }

      const raw =
        snap.quoteDirection === "exact_out" ? snap.buyAmount : snap.sellAmount;
      const amount = parseAmount(raw);
      if (!(amount > 0) || !Number.isFinite(amount)) {
        setSwapQuoteResult({
          sellAmount: snap.sellAmount,
          buyAmount: snap.quoteDirection === "exact_in" ? "" : snap.buyAmount,
          sellNumeric: null,
          buyNumeric: null,
          error: null,
          isQuoting: false,
        });
        return;
      }

      const id = ++requestIdRef.current;
      setSwapQuoting(true);

      void buildSwapRouteQuote({
        sellToken: snap.sellToken,
        buyToken: snap.buyToken,
        amount,
        direction: snap.quoteDirection,
      })
        .then((quote) => {
          if (id !== requestIdRef.current) return;
          applyRouteQuoteToStore(snap, quote, false, null);
        })
        .catch((err) => {
          if (id !== requestIdRef.current) return;
          const message =
            err instanceof Error ? err.message : "quote_failed";
          setSwapQuoteResult({
            sellAmount: snap.sellAmount,
            buyAmount: snap.quoteDirection === "exact_in" ? "" : snap.buyAmount,
            sellNumeric: null,
            buyNumeric: null,
            error: message,
            isQuoting: false,
          });
        });
    };

    const debounceMs = pairUsesLedgerDllrChartQuote(
      pair.sellToken,
      pair.buyToken,
    )
      ? 120
      : QUOTE_DEBOUNCE_MS;
    const timer = setTimeout(run, debounceMs);
    return () => clearTimeout(timer);
  }, [
    chartPriceUsdPerChartToken,
    pair.sellToken.address,
    pair.buyToken.address,
    pair.sellToken.isNative,
    pair.buyToken.isNative,
    pair.sellAmount,
    pair.buyAmount,
    pair.quoteDirection,
    pair.basisField,
  ]);

  useEffect(() => subscribeSwapPair(() => {}), []);
}
