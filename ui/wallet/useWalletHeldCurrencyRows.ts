import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useAppStrings } from "../../locales/AppStringsContext";
import {
  buildChooseCurrencyDllrRow,
  type ChooseCurrencyRow,
} from "../components/swap/chooseCurrencyTableTypes";
import { swapTonTokenImage } from "../components/swap/swapFormAssets";
import { logPageDisplay } from "../pageDisplayLog";
import { fetchTonapiAccountHoldings } from "../ton/fetchTonapiAccountHoldings";
import { requestWalletActivate } from "../ton/requestWalletActivate";
import { postWalletTopUpFeedNotification } from "../feed/feedNotificationActions";
import type { AppLocale } from "../../locales/appStrings";
import {
  formatLocaleAmount,
  formatLocaleDllrBalance,
  formatLocaleTokenBalance,
  parseLocaleAmount,
} from "../format/localeAmountFormat";
import {
  formatSwapHoldingUsd,
  formatSwapJettonBalance,
  formatSwapTokenPriceUsd,
} from "../swap/formatSwapTokenMarketValue";
import { SWAP_GRAM_TOKEN, SWAP_TON_ZERO_ADDRESS } from "../swap/swapPairTypes";
import {
  getWalletBalanceRefreshNonce,
  subscribeWalletBalanceRefresh,
} from "./walletBalanceRefresh";
import {
  getBuiltinDllrBalanceUsd,
  getBuiltinDllrFrozenUsd,
  getBuiltinDllrHotUsd,
  subscribeBuiltinDllrBalance,
} from "../pro/dllrBalanceStore";

const DLLR_SYMBOL = "DLLR";
/** Pinned baseline shown in header and wallet dialog until real DLLR balances ship. */
export const PINNED_DLLR_USD_BASELINE = 1;

function hasNonZeroRawBalance(balanceRaw: string): boolean {
  try {
    return BigInt(balanceRaw) > 0n;
  } catch {
    return false;
  }
}

function buildHeldRow(
  rowKey: string,
  name: string,
  ticker: string,
  icon: ChooseCurrencyRow["currency"]["icon"],
  balance: string,
  priceUsd: number | null | undefined,
  locale: AppLocale,
): ChooseCurrencyRow {
  const balanceNum = parseLocaleAmount(balance, locale) ?? 0;
  const usd =
    Number.isFinite(balanceNum) &&
    balanceNum > 0 &&
    priceUsd != null &&
    Number.isFinite(priceUsd) &&
    priceUsd > 0
      ? balanceNum * priceUsd
      : 0;
  return {
    rowKey,
    currency: { name, ticker, icon },
    balance,
    value: formatSwapHoldingUsd(usd, locale),
    rate: formatSwapTokenPriceUsd(priceUsd),
    networks: "TON",
    marketCapUsd: 0,
    marketCap: "—",
    volume: "—",
    lastYearKind: "stable",
  };
}

function parseUsdValue(row: ChooseCurrencyRow, locale: AppLocale): number {
  const balance = parseLocaleAmount(row.balance, locale) ?? 0;
  const rate = Number.parseFloat(row.rate.replace(/[^0-9.eE+-]/g, ""));
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return balance * rate;
}

/** Header balance line — pinned 1 DLLR plus live holdings. */
export function formatHeaderWalletBalanceLabel(
  totalUsd: number,
  locale: AppLocale = "en",
): string {
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) return "0$";
  if (totalUsd < 0.01) {
    return `<${formatLocaleAmount(0.01, locale, { maxFractionDigits: 2, minFractionDigits: 2, trimFractionZeros: false })}$`;
  }
  if (totalUsd < 1_000) {
    return `${formatLocaleAmount(totalUsd, locale, {
      maxFractionDigits: totalUsd >= 10 ? 0 : 2,
      trimFractionZeros: true,
    })}$`;
  }
  if (totalUsd < 1_000_000) {
    return `${formatLocaleAmount(Math.round(totalUsd / 1_000), locale, { maxFractionDigits: 0 })}K$`;
  }
  if (totalUsd < 1_000_000_000) {
    return `${formatLocaleAmount(totalUsd / 1_000_000, locale, { maxFractionDigits: 1, trimFractionZeros: true })}M$`;
  }
  return `${formatLocaleAmount(totalUsd / 1_000_000_000, locale, { maxFractionDigits: 1, trimFractionZeros: true })}B$`;
}

export type WalletHeldCurrencyRowsState = {
  rows: readonly ChooseCurrencyRow[];
  isLoading: boolean;
  error: string | null;
  headerBalanceLabel: string;
};

/** Jettons and native GRAM with a non-zero on-chain balance for one wallet address (TonAPI). */
export function useWalletHeldCurrencyRows(
  walletAddress: string | null | undefined,
  enabled = true,
  /** Telegram initData for authenticated calls (e.g. wallet activation). */
  initDataRaw?: string | null,
  options?: {
    /**
     * Pin the cross-wallet DLLR ledger row first (default true).
     * DLLR is account-level, not tied to the on-chain wallet kind.
     */
    includeDllrLedger?: boolean;
  },
): WalletHeldCurrencyRowsState {
  const includeDllrLedger = options?.includeDllrLedger !== false;
  const { locale, t, tf } = useAppStrings();
  const refreshNonce = useSyncExternalStore(
    subscribeWalletBalanceRefresh,
    getWalletBalanceRefreshNonce,
    getWalletBalanceRefreshNonce,
  );
  const dllrBalanceUsd = useSyncExternalStore(
    subscribeBuiltinDllrBalance,
    getBuiltinDllrBalanceUsd,
    getBuiltinDllrBalanceUsd,
  );
  const dllrHotUsd = useSyncExternalStore(
    subscribeBuiltinDllrBalance,
    getBuiltinDllrHotUsd,
    getBuiltinDllrHotUsd,
  );
  const dllrFrozenUsd = useSyncExternalStore(
    subscribeBuiltinDllrBalance,
    getBuiltinDllrFrozenUsd,
    getBuiltinDllrFrozenUsd,
  );
  const accountCreationDllrRow = useMemo(() => {
    const base = buildChooseCurrencyDllrRow(locale);
    const bal = formatLocaleDllrBalance(dllrBalanceUsd, locale);
    const fmt = (n: number) => formatLocaleDllrBalance(n, locale);
    return {
      ...base,
      balance: bal || "0",
      value: formatSwapHoldingUsd(dllrBalanceUsd, locale),
      dllrLedger: {
        hot: fmt(dllrHotUsd),
        frozen: fmt(dllrFrozenUsd),
      },
    };
  }, [dllrBalanceUsd, dllrFrozenUsd, dllrHotUsd, locale]);
  const [heldRows, setHeldRows] = useState<readonly ChooseCurrencyRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const withoutDllr = heldRows.filter(
      (row) =>
        row.rowKey !== accountCreationDllrRow.rowKey &&
        row.currency.ticker.trim().toUpperCase() !== DLLR_SYMBOL,
    );
    if (!includeDllrLedger) return withoutDllr;
    return [accountCreationDllrRow, ...withoutDllr];
  }, [accountCreationDllrRow, heldRows, includeDllrLedger]);

  const headerBalanceLabel = useMemo(() => {
    const heldUsd = heldRows.reduce((sum, row) => sum + parseUsdValue(row, locale), 0);
    const totalUsd = (includeDllrLedger ? dllrBalanceUsd : 0) + heldUsd;
    const label = formatHeaderWalletBalanceLabel(totalUsd, locale);
    logPageDisplay("wallet_header_total", {
      baselineUsd: includeDllrLedger ? dllrBalanceUsd : 0,
      heldUsd,
      totalUsd,
      heldRowCount: heldRows.length,
      label,
      includeDllrLedger,
    });
    return label;
  }, [dllrBalanceUsd, heldRows, includeDllrLedger, locale]);

  const prevNativeBalanceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const trimmed = walletAddress?.trim() ?? "";
    if (!trimmed) {
      setHeldRows([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const holdings = await fetchTonapiAccountHoldings(trimmed);
        if (cancelled) return;

        logPageDisplay("wallet_held_balances", {
          source: "tonapi",
          addressPreview: `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`,
          status: holdings.status,
          nativeBalance: holdings.nativeBalance,
          jettonCount: holdings.jettons.length,
          tonPriceUsd: holdings.tonPriceUsd,
        });

        const statusLc = (holdings.status ?? "").toLowerCase();
        if (
          holdings.nativeBalance >= 0.005 &&
          statusLc &&
          statusLc !== "active"
        ) {
          void requestWalletActivate({ initDataRaw: initDataRaw ?? undefined, force: true });
        }

        // Detect incoming transfer: balance increased since last poll.
        const prevBal = prevNativeBalanceRef.current;
        if (
          prevBal !== null &&
          holdings.nativeBalance > prevBal &&
          holdings.nativeBalance - prevBal >= 0.0001
        ) {
          const delta = holdings.nativeBalance - prevBal;
          const symbol = SWAP_GRAM_TOKEN.symbol;
          const deltaStr = delta.toFixed(7).replace(/\.?0+$/, "");
          const sourceId = `incoming:${Date.now()}:${deltaStr}:${symbol}:${trimmed.slice(-8)}`;
          void postWalletTopUpFeedNotification({
            initDataRaw: initDataRaw ?? undefined,
            sourceId,
            amount: deltaStr,
            symbol,
            title: t("feed.incomingTransfer.title"),
            subtitle: tf("feed.incomingTransfer.subtitle", { amount: deltaStr, symbol }),
            trailingLabel: tf("feed.incomingTransfer.trailing", { amount: deltaStr, symbol }),
          });
        }
        prevNativeBalanceRef.current = holdings.nativeBalance;

        const next: ChooseCurrencyRow[] = [];

        if (holdings.nativeBalance > 0) {
          next.push(
            buildHeldRow(
              SWAP_TON_ZERO_ADDRESS,
              SWAP_GRAM_TOKEN.name,
              SWAP_GRAM_TOKEN.symbol,
              swapTonTokenImage,
              formatLocaleTokenBalance(holdings.nativeBalance, locale, 7),
              holdings.tonPriceUsd,
              locale,
            ),
          );
        }

        for (const item of holdings.jettons) {
          if (!hasNonZeroRawBalance(item.balance)) continue;
          const jetton = item.jetton;
          if (jetton.symbol.trim().toUpperCase() === DLLR_SYMBOL) continue;
          const addressKey = jetton.address.toLowerCase();
          if (addressKey === SWAP_TON_ZERO_ADDRESS.toLowerCase()) continue;

          const decimals = typeof jetton.decimals === "number" ? jetton.decimals : 9;
          const symbol = jetton.symbol.trim();
          const name = (jetton.name ?? symbol).trim() || symbol;
          next.push(
            buildHeldRow(
              addressKey,
              name,
              symbol,
              jetton.image ? ({ uri: jetton.image } as const) : null,
              formatSwapJettonBalance(item.balance, decimals, locale),
              item.priceUsd,
              locale,
            ),
          );
        }

        next.sort((a, b) => {
          const delta = parseUsdValue(b, locale) - parseUsdValue(a, locale);
          if (delta !== 0) return delta;
          return a.currency.ticker.localeCompare(b.currency.ticker);
        });

        setHeldRows(next);
      } catch (err) {
        if (cancelled) return;
        setHeldRows([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const id = setInterval(() => void load(), 30_000);

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [enabled, initDataRaw, locale, refreshNonce, t, tf, walletAddress]);

  return { rows, isLoading, error, headerBalanceLabel };
}
