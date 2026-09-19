import type { AppLocale } from "../../locales/appStrings";
import { formatLocaleAmount } from "../format/localeAmountFormat";

/** Header balance line — full number with up to two fraction digits (never K/M/B). */
export function formatHeaderWalletBalanceLabel(
  totalUsd: number,
  locale: AppLocale = "en",
): string {
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) return "0$";
  if (totalUsd < 0.01) {
    return `<${formatLocaleAmount(0.01, locale, { maxFractionDigits: 2, minFractionDigits: 2, trimFractionZeros: false })}$`;
  }
  return `${formatLocaleAmount(totalUsd, locale, {
    maxFractionDigits: 2,
    minFractionDigits: 0,
    trimFractionZeros: true,
  })}$`;
}
