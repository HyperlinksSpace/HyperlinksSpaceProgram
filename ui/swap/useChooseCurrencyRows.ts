import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useAppStrings } from "../../locales/AppStringsContext";
import {
  buildChooseCurrencyDllrRow,
  type ChooseCurrencyRow,
  type ChooseCurrencyTableSection,
} from "../components/swap/chooseCurrencyTableTypes";
import { formatLocaleDllrBalance } from "../format/localeAmountFormat";
import {
  getBuiltinDllrBalanceUsd,
  subscribeBuiltinDllrBalance,
} from "../pro/dllrBalanceStore";
import { formatSwapHoldingUsd } from "./formatSwapTokenMarketValue";
import { fetchAccountSwapJettons } from "./fetchSwapJettons";
import {
  buildBalanceByJettonAddress,
  mapJettonToChooseCurrencyRow,
} from "./mapJettonToChooseCurrencyRow";
import {
  ensureSwapJettonsCatalogLoading,
  getSwapJettonsCatalogSnapshot,
  requestSwapJettonsNextPage,
  subscribeSwapJettonsCatalog,
} from "./swapJettonsCatalogCache";
import {
  partitionChooseCurrencyRowsForWalletFirst,
  sortChooseCurrencyRowsByMarketCap,
  type ChooseCurrencyWalletPartition,
} from "./partitionChooseCurrencyRows";
import type { SwapAccountJettonBalance, SwapJetton } from "./swapJettonsTypes";

function mergeAccountJettons(
  catalog: readonly SwapJetton[],
  accountItems: readonly SwapAccountJettonBalance[] | undefined,
): SwapJetton[] {
  const seen = new Set(catalog.map((j) => j.address.toLowerCase()));
  const extra: SwapJetton[] = [];
  for (const item of accountItems ?? []) {
    const jetton = item.jetton;
    const address = item.jetton_address?.toLowerCase();
    if (!jetton || !address || seen.has(address)) continue;
    seen.add(address);
    extra.push({ ...jetton, address: jetton.address ?? item.jetton_address });
  }
  return extra.length > 0 ? [...catalog, ...extra] : [...catalog];
}

export type ChooseCurrencyRowsState = {
  rows: readonly ChooseCurrencyRow[];
  /** Swap buy/sell picker: wallet-held tokens first, then the catalog. */
  rowSections?: readonly ChooseCurrencyTableSection[];
  isLoading: boolean;
  isFetchingMore: boolean;
  error: string | null;
  totalJettons: number;
  loadMore: () => void;
};

export type UseChooseCurrencyRowsOptions = {
  /** Group non-zero wallet balances above the market catalog (swap token picker). */
  walletSectionFirst?: boolean;
  walletSectionTitle?: string | null;
};

export function useChooseCurrencyRows(
  walletAddress: string | null | undefined,
  enabled = true,
  options?: UseChooseCurrencyRowsOptions,
): ChooseCurrencyRowsState {
  const walletSectionFirst = options?.walletSectionFirst === true;
  const walletSectionTitle = options?.walletSectionTitle ?? null;
  const { locale } = useAppStrings();
  const dllrBalanceUsd = useSyncExternalStore(
    subscribeBuiltinDllrBalance,
    getBuiltinDllrBalanceUsd,
    getBuiltinDllrBalanceUsd,
  );
  const catalog = useSyncExternalStore(
    subscribeSwapJettonsCatalog,
    getSwapJettonsCatalogSnapshot,
    getSwapJettonsCatalogSnapshot,
  );

  const [balanceByAddress, setBalanceByAddress] = useState<Map<string, string>>(new Map());
  const [accountItems, setAccountItems] = useState<readonly SwapAccountJettonBalance[]>([]);
  const accountLoadIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    ensureSwapJettonsCatalogLoading();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const trimmedWallet = walletAddress?.trim() ?? "";
    if (!trimmedWallet) {
      setBalanceByAddress(new Map());
      setAccountItems([]);
      return;
    }

    const loadId = ++accountLoadIdRef.current;
    let cancelled = false;

    void fetchAccountSwapJettons(trimmedWallet)
      .then((response) => {
        if (cancelled || loadId !== accountLoadIdRef.current) return;
        setBalanceByAddress(buildBalanceByJettonAddress(response.items ?? []));
        setAccountItems(response.items ?? []);
      })
      .catch(() => {
        if (cancelled || loadId !== accountLoadIdRef.current) return;
        setBalanceByAddress(new Map());
        setAccountItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, enabled]);

  const jettons = useMemo(
    () => mergeAccountJettons(catalog.jettons, accountItems),
    [catalog.jettons, accountItems],
  );

  const dllrRow = useMemo(() => {
    const base = buildChooseCurrencyDllrRow(locale);
    if (!walletSectionFirst) return base;
    const hasDllr = dllrBalanceUsd > 0;
    const balance = hasDllr ? formatLocaleDllrBalance(dllrBalanceUsd, locale) : "—";
    return {
      ...base,
      balance,
      value: formatSwapHoldingUsd(dllrBalanceUsd, locale),
    };
  }, [dllrBalanceUsd, locale, walletSectionFirst]);

  const browseRows = useMemo(() => {
    const apiRows: ChooseCurrencyRow[] = [];
    for (const jetton of jettons) {
      const row = mapJettonToChooseCurrencyRow(jetton, balanceByAddress, locale);
      if (!row) continue;
      apiRows.push(row);
    }
    return [dllrRow, ...sortChooseCurrencyRowsByMarketCap(apiRows)];
  }, [balanceByAddress, dllrRow, jettons, locale]);

  const walletPartition = useMemo((): ChooseCurrencyWalletPartition | null => {
    if (!walletSectionFirst) return null;
    return partitionChooseCurrencyRowsForWalletFirst(browseRows, locale);
  }, [browseRows, locale, walletSectionFirst]);

  const rowSections = useMemo((): readonly ChooseCurrencyTableSection[] | undefined => {
    if (!walletPartition) return undefined;
    const sections: ChooseCurrencyTableSection[] = [];
    if (walletPartition.walletAvailable.length > 0) {
      sections.push({
        title: walletSectionTitle,
        rows: walletPartition.walletAvailable,
      });
    }
    if (walletPartition.rest.length > 0) {
      sections.push({ title: null, rows: walletPartition.rest });
    }
    return sections.length > 0 ? sections : undefined;
  }, [walletPartition, walletSectionTitle]);

  const rows = useMemo(() => {
    if (!walletPartition) return browseRows;
    return [...walletPartition.walletAvailable, ...walletPartition.rest];
  }, [browseRows, walletPartition]);

  const loadMore = useCallback(() => {
    requestSwapJettonsNextPage();
  }, []);

  return {
    rows,
    rowSections,
    isLoading: enabled && catalog.isLoading && rows.length <= 1,
    isFetchingMore: enabled && catalog.isFetchingMore,
    error: catalog.error,
    totalJettons: jettons.length,
    loadMore,
  };
}
