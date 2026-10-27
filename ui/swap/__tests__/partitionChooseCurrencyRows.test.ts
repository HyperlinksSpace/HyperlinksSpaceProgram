import { describe, expect, it } from "vitest";

import type { ChooseCurrencyRow } from "../../components/swap/chooseCurrencyTableTypes";
import {
  chooseCurrencyRowHasWalletBalance,
  partitionChooseCurrencyRowsForWalletFirst,
  sortChooseCurrencyRowsByMarketCap,
} from "../partitionChooseCurrencyRows";

function row(
  key: string,
  ticker: string,
  balance: string,
  marketCapUsd: number,
): ChooseCurrencyRow {
  return {
    rowKey: key,
    currency: { name: ticker, ticker, icon: null },
    balance,
    value: "—",
    rate: "—",
    networks: "TON",
    marketCapUsd,
    marketCap: "—",
    volume: "—",
    lastYearKind: "sparkline",
  };
}

describe("partitionChooseCurrencyRowsForWalletFirst", () => {
  it("splits held tokens and sorts each group by market cap", () => {
    const input = [
      row("a", "AAA", "10", 100),
      row("b", "BBB", "—", 500),
      row("c", "CCC", "1", 200),
      row("d", "DDD", "—", 300),
    ];
    const { walletAvailable, rest } = partitionChooseCurrencyRowsForWalletFirst(input, "en");
    expect(walletAvailable.map((r) => r.rowKey)).toEqual(["c", "a"]);
    expect(rest.map((r) => r.rowKey)).toEqual(["b", "d"]);
  });

  it("detects wallet balance from locale-formatted amounts", () => {
    expect(chooseCurrencyRowHasWalletBalance(row("x", "X", "1,5", 0), "ru")).toBe(true);
    expect(chooseCurrencyRowHasWalletBalance(row("x", "X", "—", 0), "en")).toBe(false);
  });

  it("sortChooseCurrencyRowsByMarketCap orders descending", () => {
    const sorted = sortChooseCurrencyRowsByMarketCap([
      row("a", "A", "—", 10),
      row("b", "B", "—", 50),
    ]);
    expect(sorted[0]?.rowKey).toBe("b");
  });
});
