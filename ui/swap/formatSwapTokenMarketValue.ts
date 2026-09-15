import type { AppLocale } from "../../locales/appStrings";
import {
  formatLocaleAmount,
  formatLocaleTokenBalance,
} from "../format/localeAmountFormat";

/**
 * Compact USD for choose-currency market cap / volume.
 * Always uses Q / T / B / M (quadrillion → million), same for every UI locale.
 * Example: 2.1T$+, 7.7B$+, 278.8M$+.
 */
export function formatSwapUsdCompact(
  value: number | null | undefined,
  _locale: AppLocale = "en",
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";

  const abs = Math.abs(value);
  const tiers = [
    { min: 1e15, div: 1e15, suffix: "Q$+" },
    { min: 1e12, div: 1e12, suffix: "T$+" },
    { min: 1e9, div: 1e9, suffix: "B$+" },
    { min: 1e6, div: 1e6, suffix: "M$+" },
  ] as const;

  for (const tier of tiers) {
    if (abs >= tier.min) {
      return `${formatCompactCoefficient(value / tier.div)}${tier.suffix}`;
    }
  }

  if (abs >= 1e3) {
    return `${formatCompactCoefficient(value / 1e3)}K$+`;
  }

  return `${value.toFixed(2)}$`;
}

/** One decimal max; drop trailing `.0` so 3 → `3`, 2.1 → `2.1`. */
function formatCompactCoefficient(scaled: number): string {
  const rounded = Math.round(scaled * 10) / 10;
  if (!Number.isFinite(rounded)) return "0";
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

export function formatSwapTokenPriceUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.000001) {
    const fracDigits = Math.min(10, Math.max(4, Math.ceil(-Math.log10(value)) + 1));
    const trimmed = value
      .toFixed(fracDigits)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
    return `$${trimmed}`;
  }
  return `$${value.toExponential(2)}`;
}

/** USD notional for a wallet holding (balance × rate). Matches `$` rate style. */
export function formatSwapHoldingUsd(
  value: number | null | undefined,
  locale: AppLocale = "en",
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value < 0.01) {
    return `<$${formatLocaleAmount(0.01, locale, { maxFractionDigits: 2, minFractionDigits: 2, trimFractionZeros: false })}`;
  }
  if (value < 1_000) {
    return `$${formatLocaleAmount(value, locale, { maxFractionDigits: 2, trimFractionZeros: true })}`;
  }
  if (value < 1_000_000) {
    return `$${formatLocaleAmount(Math.round(value / 1_000), locale, { maxFractionDigits: 0 })}K`;
  }
  if (value < 1_000_000_000) {
    return `$${formatLocaleAmount(value / 1_000_000, locale, { maxFractionDigits: 1, trimFractionZeros: true })}M`;
  }
  return `$${formatLocaleAmount(value / 1_000_000_000, locale, { maxFractionDigits: 1, trimFractionZeros: true })}B`;
}

export function formatSwapJettonBalance(
  balanceRaw: string,
  decimals: number,
  locale: AppLocale = "en",
): string {
  try {
    const raw = BigInt(balanceRaw);
    if (raw === 0n) return "0";
    const scale = 10n ** BigInt(Math.max(0, decimals));
    const whole = raw / scale;
    const frac = raw % scale;
    if (frac === 0n) {
      return formatLocaleAmount(Number(whole), locale, { maxFractionDigits: 0 });
    }

    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    if (!fracStr) {
      return formatLocaleAmount(Number(whole), locale, { maxFractionDigits: 0 });
    }
    const combined = `${whole}.${fracStr}`;
    const asNum = Number(combined);
    if (Number.isFinite(asNum)) {
      if (asNum >= 1_000_000) {
        return formatLocaleAmount(Math.round(asNum), locale, { maxFractionDigits: 0 });
      }
      if (asNum >= 1) {
        return formatLocaleAmount(asNum, locale, { maxFractionDigits: 4, trimFractionZeros: true });
      }
      return formatLocaleTokenBalance(asNum, locale, 7);
    }
    return combined;
  } catch {
    return "—";
  }
}
