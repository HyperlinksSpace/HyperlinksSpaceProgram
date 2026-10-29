import { useEffect, useRef } from "react";

import type { SwapPairState } from "./swapPairStore";
import { quoteLedgerDllrChartPair } from "./estimateDllrPairAmounts";
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
  setSwapQuoteNumerics,
  setSwapQuoting,
  subscribeSwapPair,
  useSwapPairState,
} from "./swapPairStore";

const QUOTE_DEBOUNCE_MS = 350;

function parseAmount(raw: string): number {
  return Number(String(raw).replace(",", ".").trim());
}

function applyRouteQuoteToStore(
  quote: { inputAmount: number; outputAmount: number },
  isQuoting: boolean,
  error: string | null,
): boolean {
  const live = getSwapPairState();
  const sellNumeric =
    live.quoteDirection === "exact_out" && Number.isFinite(quote.inputAmount)
      ? quote.inputAmount
      : live.lastQuotedSellAmount;
  const buyNumeric =
    live.quoteDirection === "exact_in" && Number.isFinite(quote.outputAmount)
      ? quote.outputAmount
      : live.lastQuotedBuyAmount;
  const numericsUnchanged =
    live.lastQuotedSellAmount === sellNumeric &&
    live.lastQuotedBuyAmount === buyNumeric;
  if (
    numericsUnchanged &&
    live.isQuoting === isQuoting &&
    live.quoteError === error
  ) {
    return false;
  }
  setSwapQuoteNumerics({
    sellNumeric,
    buyNumeric,
    error,
    isQuoting,
  });
  return true;
}

function quoteBasisAmount(snap: SwapPairState): string {
  return snap.basisField === "sell" ? snap.sellAmount : snap.buyAmount;
}

function quoteInputKey(snap: SwapPairState): string {
  return [
    snap.sellToken.address,
    snap.sellToken.isNative ? "1" : "0",
    snap.buyToken.address,
    snap.buyToken.isNative ? "1" : "0",
    snap.quoteDirection,
    snap.basisField,
    quoteBasisAmount(snap),
  ].join("|");
}

function chartQuoteForSnap(
  snap: SwapPairState,
  chartPriceUsdPerChartToken: number,
): { inputAmount: number; outputAmount: number } | null {
  const dllrOnSellSide = isDllrSellPair(snap.sellToken, snap.buyToken);
  let leg: { sellAmount: number; buyAmount: number } | null;
  if (snap.quoteDirection === "exact_in") {
    const sellInput = parseAmount(snap.sellAmount);
    if (!(sellInput > 0)) return null;
    leg = quoteLedgerDllrChartPair({
      dllrOnSellSide,
      direction: "exact_in",
      sellAmount: sellInput,
      buyAmount: 0,
      chartPriceUsdPerChartToken,
    });
  } else {
    const buyInput = parseAmount(snap.buyAmount);
    if (!(buyInput > 0)) return null;
    leg = quoteLedgerDllrChartPair({
      dllrOnSellSide,
      direction: "exact_out",
      sellAmount: 0,
      buyAmount: buyInput,
      chartPriceUsdPerChartToken,
    });
  }
  if (!leg) return null;
  return {
    inputAmount: leg.sellAmount,
    outputAmount: leg.buyAmount,
  };
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
          setSwapQuoting(false);
          return;
        }

        let paintedFromChart = false;
        if (
          chartPriceUsdPerChartToken != null &&
          Number.isFinite(chartPriceUsdPerChartToken) &&
          chartPriceUsdPerChartToken > 0
        ) {
          const live = getSwapPairState();
          const chart = chartQuoteForSnap(live, chartPriceUsdPerChartToken);
          if (chart) {
            paintedFromChart = applyRouteQuoteToStore(chart, false, null);
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
            applyRouteQuoteToStore(quote, false, null);
          })
          .catch((err) => {
            if (id !== requestIdRef.current) return;
            const message =
              err instanceof Error ? err.message : "quote_failed";
            const fresh = getSwapPairState();
            if (
              chartPriceUsdPerChartToken != null &&
              Number.isFinite(chartPriceUsdPerChartToken) &&
              chartPriceUsdPerChartToken > 0
            ) {
              const chart = chartQuoteForSnap(fresh, chartPriceUsdPerChartToken);
              if (chart) {
                applyRouteQuoteToStore(chart, false, null);
                return;
              }
            }
            setSwapQuoteNumerics({
              sellNumeric: fresh.lastQuotedSellAmount,
              buyNumeric: fresh.lastQuotedBuyAmount,
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
        setSwapQuoteNumerics({
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
          applyRouteQuoteToStore(quote, false, null);
        })
        .catch((err) => {
          if (id !== requestIdRef.current) return;
          const message =
            err instanceof Error ? err.message : "quote_failed";
          const fresh = getSwapPairState();
          setSwapQuoteNumerics({
            sellNumeric: fresh.lastQuotedSellAmount,
            buyNumeric: fresh.lastQuotedBuyAmount,
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
    pair.quoteDirection,
    pair.basisField,
    pair.basisField === "sell" ? pair.sellAmount : pair.buyAmount,
  ]);

  useEffect(() => subscribeSwapPair(() => {}), []);
}
