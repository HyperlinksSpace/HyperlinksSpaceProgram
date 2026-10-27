import { useEffect, useMemo, useState } from "react";
import { Address } from "@ton/core";

import { useTelegram } from "../components/Telegram";
import { useTonConnectSession } from "../ton/TonConnectProvider";
import { fetchTonapiAccountHoldings } from "../ton/fetchTonapiAccountHoldings";
import {
  resolveActiveWalletAddress,
  useActiveWalletPreference,
} from "../wallet/activeWalletPreference";
import { SWAP_BUY_AMOUNT_TON } from "./fetchSwapAmount";
import { useSwapCurrencyPicker } from "./swapCurrencyPicker";
import { useSwapPairState } from "./swapPairStore";
import {
  isDllrToken,
  isNativeTonToken,
  SWAP_GRAM_TOKEN,
  swapChartTokenForPair,
  swapTokenChartAddress,
  swapTokenDisplaySymbol,
  swapUnitAmountSide,
  type SwapPairToken,
} from "./swapPairTypes";
import { useSwapChart } from "./useSwapChart";
import type { SwapWalletKind } from "./executeSwapOnWallet";

/**
 * Wallet DLLR available for the sample strip (“1$”) until real balances are wired.
 * Deal is inactive (Low amount) when the quoted sell cost exceeds this.
 */
export const SWAP_AVAILABLE_DLLR_PLACEHOLDER = 1;

const JETTON_SWAP_TON_GAS = 0.05;

/** Notice shown immediately left of the Swap button. */
export type SwapDealButtonNotice =
  | "none"
  | "noAmount"
  | "lowAmount"
  | "noPool"
  | "dllrFrozen"
  | "noWallet"
  | "failed";

export type SwapDealActionState = {
  /** DLLR needed to buy/sell 1 unit of the offer / deal asset. */
  dllrAmount: number | null;
  /** Ticker for the left-edge offer copy. */
  buySymbol: string;
  /** `buy` = Buy 1 asset for dllr; `sell` = Sell 1 asset for dllr (after rotate). */
  dealSide: "buy" | "sell";
  /** Status text immediately left of Swap (`DLLR Frozen` / `No pool` / `No amount` / `Low amount`). */
  buttonNotice: SwapDealButtonNotice;
  /** When false, Swap uses inactive undercover + is not pressable. */
  buttonActive: boolean;
  /** Currencies / choose-currency picker is covering the form. */
  onCurrencyScreen: boolean;
  walletKind: SwapWalletKind;
  senderAddress: string;
  fromToken: SwapPairToken;
  toToken: SwapPairToken;
  fromAmount: string;
  initDataRaw: string | null;
};

function quoteMeansNoPool(quoteError: string | null): boolean {
  if (!quoteError) return false;
  const key = quoteError.trim().toLowerCase();
  return (
    key === "no_route" ||
    key === "no pool" ||
    key.includes("no_route") ||
    key.includes("no route") ||
    key.includes("no pool")
  );
}

function parseSellAmount(raw: string, quoted: number | null): number | null {
  if (quoted != null && Number.isFinite(quoted) && quoted > 0) return quoted;
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function addressesEqual(a: string, b: string): boolean {
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
}

function sellTokenBalance(
  token: SwapPairToken,
  holdings: { nativeBalance: number; jettons: Array<{ balance: string; jetton: { address: string; decimals?: number } }> } | null,
): number {
  if (!holdings) return 0;
  if (isNativeTonToken(token)) return holdings.nativeBalance;
  for (const row of holdings.jettons) {
    if (!addressesEqual(row.jetton.address, token.address)) continue;
    const decimals = typeof row.jetton.decimals === "number" ? row.jetton.decimals : token.decimals;
    try {
      const raw = BigInt(row.balance);
      if (raw <= 0n) return 0;
      return Number(raw) / 10 ** decimals;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Shared deal summary / Swap button state for inline (2-col) and column footer (3-col). */
export function useSwapDealActionState(): SwapDealActionState {
  const pickerMode = useSwapCurrencyPicker();
  const onCurrencyScreen = pickerMode != null;
  const pair = useSwapPairState();
  const { sellToken, buyToken, quoteError, sellAmount, lastQuotedSellAmount, isQuoting } = pair;
  const { wallet, initData } = useTelegram();
  const tonConnect = useTonConnectSession();
  const preference = useActiveWalletPreference();
  const builtinAddress = (wallet?.wallet_address ?? "").trim();
  const senderAddress = resolveActiveWalletAddress({
    builtinAddress,
    preference,
    tonConnected: tonConnect.connected,
    tonAddress: tonConnect.friendlyAddress || tonConnect.address,
  });
  const walletKind: SwapWalletKind =
    preference.source === "imported"
      ? "imported"
      : preference.source === "tonconnect"
        ? "tonconnect"
        : "builtin";

  const [holdings, setHoldings] = useState<{
    nativeBalance: number;
    jettons: Array<{ balance: string; jetton: { address: string; decimals?: number } }>;
  } | null>(null);

  useEffect(() => {
    const addr = senderAddress.trim();
    if (!addr) {
      setHoldings(null);
      return;
    }
    let cancelled = false;
    void fetchTonapiAccountHoldings(addr)
      .then((next) => {
        if (cancelled) return;
        setHoldings({
          nativeBalance: next.nativeBalance,
          jettons: next.jettons.map((row) => ({
            balance: row.balance,
            jetton: { address: row.jetton.address, decimals: row.jetton.decimals },
          })),
        });
      })
      .catch(() => {
        if (!cancelled) setHoldings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [senderAddress]);

  const offerToken = onCurrencyScreen
    ? SWAP_GRAM_TOKEN
    : swapChartTokenForPair(sellToken, buyToken);
  const chartJettonAddress = swapTokenChartAddress(offerToken);
  const buySymbol = onCurrencyScreen ? "GRAM" : swapTokenDisplaySymbol(offerToken);
  const dealSide: "buy" | "sell" = onCurrencyScreen
    ? "buy"
    : swapUnitAmountSide(sellToken, buyToken) === "buy"
      ? "buy"
      : "sell";

  const { effectivePriceUsd } = useSwapChart("d", {
    deferInitialLoad: true,
    jettonAddress: chartJettonAddress,
    enabled: !onCurrencyScreen,
  });

  const dllrAmount = useMemo(() => {
    if (effectivePriceUsd == null || !Number.isFinite(effectivePriceUsd)) return null;
    return effectivePriceUsd * SWAP_BUY_AMOUNT_TON;
  }, [effectivePriceUsd]);

  const fromAmountNum = parseSellAmount(sellAmount, lastQuotedSellAmount);
  const hasQuotedAmount = fromAmountNum != null;
  const dllrInPair =
    onCurrencyScreen || isDllrToken(sellToken) || isDllrToken(buyToken);
  const noPool = !dllrInPair && quoteMeansNoPool(quoteError);
  const hasWallet = senderAddress.trim().length > 0;
  const tokenBal = sellTokenBalance(sellToken, holdings);
  const nativeBal = holdings?.nativeBalance ?? 0;
  const enoughSell = hasQuotedAmount && tokenBal + 1e-12 >= fromAmountNum;
  const enoughGas = isNativeTonToken(sellToken) || nativeBal >= JETTON_SWAP_TON_GAS;
  const hasEnough = enoughSell && enoughGas;

  const buttonNotice: SwapDealButtonNotice = dllrInPair
    ? "dllrFrozen"
    : noPool
      ? "noPool"
      : !hasQuotedAmount
        ? "noAmount"
        : !hasWallet
          ? "noWallet"
          : !hasEnough
            ? "lowAmount"
            : "none";

  const fromAmount =
    fromAmountNum != null ? String(fromAmountNum) : sellAmount.trim();

  return {
    dllrAmount,
    buySymbol,
    dealSide,
    buttonNotice,
    buttonActive:
      !onCurrencyScreen &&
      !dllrInPair &&
      !noPool &&
      hasQuotedAmount &&
      hasWallet &&
      hasEnough &&
      !isQuoting,
    onCurrencyScreen,
    walletKind,
    senderAddress,
    fromToken: sellToken,
    toToken: buyToken,
    fromAmount,
    initDataRaw: initData,
  };
}
