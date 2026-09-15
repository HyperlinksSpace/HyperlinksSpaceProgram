import {
  appLocaleToBcp47,
  type AppLocale,
} from "../../locales/appStrings";

export type LocaleAmountFormatOptions = {
  /** Max fraction digits (default 2). */
  maxFractionDigits?: number;
  /** Min fraction digits (default 0). */
  minFractionDigits?: number;
  /** Drop trailing fractional zeros (default true). */
  trimFractionZeros?: boolean;
};

function bcp47(locale: AppLocale | undefined): string {
  return appLocaleToBcp47(locale ?? "en");
}

/**
 * Decimal separator for the UI locale (`.` for en/zh, `,` for ru).
 */
export function localeDecimalSeparator(locale: AppLocale | undefined): string {
  const parts = new Intl.NumberFormat(bcp47(locale), {
    useGrouping: false,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).formatToParts(1.1);
  return parts.find((p) => p.type === "decimal")?.value ?? ".";
}

/**
 * Grouping (thousands) separator for the UI locale (`,` en/zh, thin space / `.` for ru).
 */
export function localeGroupingSeparator(locale: AppLocale | undefined): string {
  const parts = new Intl.NumberFormat(bcp47(locale), {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(1000);
  return parts.find((p) => p.type === "group")?.value ?? ",";
}

/**
 * Format a finite number with locale-aware grouping + decimal separators.
 */
export function formatLocaleAmount(
  value: number,
  locale: AppLocale | undefined,
  options?: LocaleAmountFormatOptions,
): string {
  if (!Number.isFinite(value)) return "0";
  const maxFractionDigits = options?.maxFractionDigits ?? 2;
  const minFractionDigits = options?.minFractionDigits ?? 0;
  const trimFractionZeros = options?.trimFractionZeros !== false;

  let formatted = new Intl.NumberFormat(bcp47(locale), {
    useGrouping: true,
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);

  if (trimFractionZeros && maxFractionDigits > 0) {
    const decimal = localeDecimalSeparator(locale);
    if (formatted.includes(decimal)) {
      const escaped = decimal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      formatted = formatted
        .replace(new RegExp(`${escaped}0+$`), "")
        .replace(new RegExp(`${escaped}$`), "");
    }
  }
  return formatted || "0";
}

/**
 * Parse a user/amount string that may use locale `,` / `.` / spaces.
 * Accepts both `.` and `,` as decimal when unambiguous.
 */
export function parseLocaleAmount(
  raw: string,
  locale?: AppLocale,
): number | null {
  let cleaned = raw.trim().replace(/\u00a0/g, " ").replace(/\s/g, "");
  if (!cleaned) return null;

  const decimal = localeDecimalSeparator(locale);
  const group = localeGroupingSeparator(locale);

  if (group && group !== decimal) {
    const groupEsc = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(groupEsc, "g"), "");
  }

  // Strip apostrophe thousands (Swiss / some locales).
  cleaned = cleaned.replace(/'/g, "");

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal; the other is thousands.
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    // Only commas: treat as decimal when locale uses `,`, else thousands.
    if (decimal === ",") {
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastDot >= 0 && decimal === ",") {
    // Locale uses `,` decimal but user typed `.` — accept `.` as decimal
    // when there is a single dot with ≤3 fractional digits.
    const parts = cleaned.split(".");
    if (parts.length === 2 && (parts[1]?.length ?? 0) <= 3) {
      /* already JS-compatible */
    } else {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Token / wallet balance display (up to 7 fraction digits, locale separators). */
export function formatLocaleTokenBalance(
  value: number,
  locale: AppLocale | undefined,
  maxFractionDigits = 7,
): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return formatLocaleAmount(value, locale, {
    maxFractionDigits,
    minFractionDigits: 0,
    trimFractionZeros: true,
  });
}

/** Compact DLLR / USD-style balance for wallet rows (0–2 fraction digits). */
export function formatLocaleDllrBalance(
  usd: number,
  locale: AppLocale | undefined,
): string {
  if (!Number.isFinite(usd) || usd <= 0) return "0";
  if (usd >= 10) {
    return formatLocaleAmount(usd, locale, {
      maxFractionDigits: 0,
      trimFractionZeros: true,
    });
  }
  return formatLocaleAmount(usd, locale, {
    maxFractionDigits: 2,
    trimFractionZeros: true,
  });
}
