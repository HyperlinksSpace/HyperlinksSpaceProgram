import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { useAppStrings } from "../../locales/AppStringsContext";
import { fetchTonapiAccountHoldings } from "../ton/fetchTonapiAccountHoldings";
import {
  getBuiltinDllrBalanceUsd,
  subscribeBuiltinDllrBalance,
} from "../pro/dllrBalanceStore";
import {
  formatHeaderWalletBalanceLabel,
} from "./useWalletHeldCurrencyRows";
import {
  getWalletBalanceRefreshNonce,
  subscribeWalletBalanceRefresh,
} from "./walletBalanceRefresh";

function sameAddressKey(a: string): string {
  return a.trim().toLowerCase();
}

function jettonAmount(balanceRaw: string, decimals: number): number {
  try {
    const raw = BigInt(balanceRaw);
    if (raw <= 0n) return 0;
    const dec = Math.max(0, Math.min(18, Math.floor(decimals)));
    const base = 10n ** BigInt(dec);
    const whole = Number(raw / base);
    const frac = Number(raw % base) / Number(base);
    return whole + frac;
  } catch {
    return 0;
  }
}

/** On-chain TON + jetton USD notional (no built-in DLLR ledger). */
export async function estimateOnChainWalletUsd(address: string): Promise<number> {
  const holdings = await fetchTonapiAccountHoldings(address);
  let usd = 0;
  if (
    holdings.nativeBalance > 0 &&
    holdings.tonPriceUsd != null &&
    Number.isFinite(holdings.tonPriceUsd) &&
    holdings.tonPriceUsd > 0
  ) {
    usd += holdings.nativeBalance * holdings.tonPriceUsd;
  }
  for (const item of holdings.jettons) {
    if (item.jetton.symbol.trim().toUpperCase() === "DLLR") continue;
    const price = item.priceUsd;
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    const decimals = typeof item.jetton.decimals === "number" ? item.jetton.decimals : 9;
    const amount = jettonAmount(item.balance, decimals);
    if (amount > 0) usd += amount * price;
  }
  return usd;
}

/**
 * Dollar-equivalent labels for wallet picker rows (left of the radio).
 * Built-in wallet address also includes the DLLR ledger balance.
 */
export function useWalletUsdBalanceByAddress(
  addresses: readonly string[],
  options?: {
    enabled?: boolean;
    /** When set, this address gets built-in DLLR added to the on-chain total. */
    builtinAddress?: string | null;
  },
): Record<string, string> {
  const { locale } = useAppStrings();
  const enabled = options?.enabled !== false;
  const builtinKey = sameAddressKey(options?.builtinAddress ?? "");
  const dllrUsd = useSyncExternalStore(
    subscribeBuiltinDllrBalance,
    getBuiltinDllrBalanceUsd,
    () => 0,
  );
  const refreshNonce = useSyncExternalStore(
    subscribeWalletBalanceRefresh,
    getWalletBalanceRefreshNonce,
    () => 0,
  );
  const addressKey = useMemo(
    () =>
      [...new Set(addresses.map(sameAddressKey).filter(Boolean))].sort().join("|"),
    [addresses],
  );
  const [onChainByKey, setOnChainByKey] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || !addressKey) {
      setOnChainByKey({});
      return;
    }
    let cancelled = false;
    const keys = addressKey.split("|").filter(Boolean);

    const load = async () => {
      const entries = await Promise.all(
        keys.map(async (key) => {
          try {
            const usd = await estimateOnChainWalletUsd(key);
            return [key, usd] as const;
          } catch {
            return [key, 0] as const;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const [key, usd] of entries) next[key] = usd;
      setOnChainByKey(next);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [addressKey, enabled, refreshNonce]);

  return useMemo(() => {
    const labels: Record<string, string> = {};
    for (const [key, onChain] of Object.entries(onChainByKey)) {
      const total = onChain + (builtinKey && key === builtinKey ? dllrUsd : 0);
      labels[key] = formatHeaderWalletBalanceLabel(total, locale);
    }
    if (builtinKey && labels[builtinKey] == null && dllrUsd > 0) {
      labels[builtinKey] = formatHeaderWalletBalanceLabel(dllrUsd, locale);
    }
    return labels;
  }, [builtinKey, dllrUsd, locale, onChainByKey]);
}
