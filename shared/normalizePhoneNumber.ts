import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalize user-entered phone numbers to E.164 (+CC…) for Telegram auth.
 * Works for any country: strips formatting, converts common international dial
 * prefixes (00, 011), maps RU/KZ domestic 8… to +7…, then validates via
 * libphonenumber (possible numbers accepted — Telegram is looser than “valid”).
 */

const LOCALE_BASE_TO_COUNTRY: Partial<Record<string, CountryCode>> = {
  ru: "RU",
  kk: "KZ",
  uk: "UA",
  be: "BY",
  zh: "CN",
  ja: "JP",
  ko: "KR",
  de: "DE",
  fr: "FR",
  it: "IT",
  es: "ES",
  pt: "BR",
  pl: "PL",
  tr: "TR",
  ar: "SA",
  hi: "IN",
  vi: "VN",
  th: "TH",
  id: "ID",
  et: "EE",
  lv: "LV",
  lt: "LT",
  fi: "FI",
  sv: "SE",
  nb: "NO",
  da: "DK",
  nl: "NL",
  cs: "CZ",
  sk: "SK",
  ro: "RO",
  hu: "HU",
  el: "GR",
  he: "IL",
  fa: "IR",
};

/** Infer ISO 3166-1 alpha-2 from one BCP-47 tag (region suffix, then language base map). */
function countryFromBcp47Tag(tag: string): CountryCode | undefined {
  const parts = tag.split(/[-_]/);
  if (parts.length >= 2) {
    const region = parts[parts.length - 1]!.toUpperCase();
    if (region.length === 2 && /^[A-Z]{2}$/.test(region)) {
      return region as CountryCode;
    }
  }
  const base = parts[0]?.toLowerCase();
  if (base && LOCALE_BASE_TO_COUNTRY[base]) {
    return LOCALE_BASE_TO_COUNTRY[base];
  }
  return undefined;
}

/** Infer ISO 3166-1 alpha-2 from BCP-47 tags and optional app locale (e.g. ru → RU). */
export function resolveDefaultPhoneCountry(input?: {
  languageTags?: readonly string[];
  appLocale?: string;
}): CountryCode | undefined {
  // App locale wins over browser `en-US` when UI is e.g. ru but OS languages list English first.
  if (input?.appLocale?.trim()) {
    const fromApp = countryFromBcp47Tag(input.appLocale.trim());
    if (fromApp) return fromApp;
  }

  const tags: string[] = [];
  if (input?.languageTags) {
    for (const tag of input.languageTags) {
      if (typeof tag === "string" && tag.trim()) tags.push(tag.trim());
    }
  }

  for (const tag of tags) {
    const parts = tag.split(/[-_]/);
    if (parts.length >= 2) {
      const region = parts[parts.length - 1]!.toUpperCase();
      if (region.length === 2 && /^[A-Z]{2}$/.test(region)) {
        return region as CountryCode;
      }
    }
  }

  for (const tag of tags) {
    const base = tag.split(/[-_]/)[0]?.toLowerCase();
    if (base && LOCALE_BASE_TO_COUNTRY[base]) {
      return LOCALE_BASE_TO_COUNTRY[base];
    }
  }
  return undefined;
}

export function readBrowserLanguageTags(): string[] {
  try {
    if (typeof navigator === "undefined") return [];
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      return navigator.languages.filter(
        (tag): tag is string => typeof tag === "string" && Boolean(tag.trim()),
      );
    }
    const single = navigator.language?.trim();
    return single ? [single] : [];
  } catch {
    return [];
  }
}

export function resolveTelegramAuthPhoneContext(appLocale?: string): {
  languageTags: string[];
  defaultCountry: CountryCode | undefined;
} {
  const languageTags = readBrowserLanguageTags();
  const defaultCountry = resolveDefaultPhoneCountry({ languageTags, appLocale });
  return { languageTags, defaultCountry };
}

export function normalizeTelegramAuthPhone(
  raw: string,
  context?: {
    defaultCountry?: CountryCode;
    languageTags?: readonly string[];
    appLocale?: string;
  },
): string {
  const defaultCountry =
    context?.defaultCountry ??
    resolveDefaultPhoneCountry({
      languageTags: context?.languageTags,
      appLocale: context?.appLocale,
    });
  return normalizePhoneNumber(raw, defaultCountry);
}

export function parseCountryCodeHint(raw: unknown): CountryCode | undefined {
  if (typeof raw !== "string") return undefined;
  const region = raw.trim().toUpperCase();
  if (region.length === 2 && /^[A-Z]{2}$/.test(region)) {
    return region as CountryCode;
  }
  return undefined;
}

export function normalizePhoneNumber(raw: string, defaultCountry?: CountryCode): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const direct = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (direct && (direct.isPossible() || direct.isValid())) {
    return direct.format("E.164");
  }

  const prepared = prepareForParse(trimmed);
  if (!prepared.value) return "";

  const parsedPrepared = parsePhoneNumberFromString(prepared.value, defaultCountry);
  if (parsedPrepared && (parsedPrepared.isPossible() || parsedPrepared.isValid())) {
    return parsedPrepared.format("E.164");
  }

  if (defaultCountry && prepared.nationalDigits) {
    const national = parsePhoneNumberFromString(prepared.nationalDigits, defaultCountry);
    if (national && (national.isPossible() || national.isValid())) {
      return national.format("E.164");
    }
  }

  if (prepared.hadInternationalIntent && isPlausibleE164Phone(prepared.value)) {
    return prepared.value;
  }
  return "";
}

/** Loose E.164 check: + then 8–15 digits, country-code first digit 1–9. */
export function isPlausibleE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

type Prepared = {
  value: string;
  hadInternationalIntent: boolean;
  /** Digits without + when input looked like a national number (no + / 00 / 011 / 8…). */
  nationalDigits: string | null;
};

function prepareForParse(raw: string): Prepared {
  const empty: Prepared = { value: "", hadInternationalIntent: false, nationalDigits: null };

  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return empty;

  const hadPlus = s.includes("+");
  let digits = s.replace(/\+/g, "");
  if (!digits) return empty;

  if (digits.startsWith("00")) {
    digits = digits.replace(/^00+/, "");
    if (!digits) return empty;
    return { value: `+${digits}`, hadInternationalIntent: true, nationalDigits: null };
  }

  if (digits.startsWith("011") && digits.length > 3) {
    digits = digits.slice(3).replace(/^0+/, "");
    if (!digits) return empty;
    return { value: `+${digits}`, hadInternationalIntent: true, nationalDigits: null };
  }

  if (/^8\d{10}$/.test(digits)) {
    return { value: `+7${digits.slice(1)}`, hadInternationalIntent: true, nationalDigits: null };
  }

  if (/^7\d{10}$/.test(digits)) {
    return { value: `+${digits}`, hadInternationalIntent: true, nationalDigits: null };
  }

  if (hadPlus) {
    if (!/^[1-9]/.test(digits)) return empty;
    return { value: `+${digits}`, hadInternationalIntent: true, nationalDigits: null };
  }

  if (/^[1-9]/.test(digits)) {
    return {
      value: `+${digits}`,
      hadInternationalIntent: false,
      nationalDigits: digits,
    };
  }

  return empty;
}
