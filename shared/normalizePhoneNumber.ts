import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Normalize user-entered phone numbers to E.164 (+CC…) for Telegram auth.
 * Works for any country: strips formatting, converts common international dial
 * prefixes (00, 011), maps RU/KZ domestic 8… to +7…, then validates via
 * libphonenumber (possible numbers accepted — Telegram is looser than “valid”).
 */

export function normalizePhoneNumber(raw: string, defaultCountry?: CountryCode): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const prepared = prepareForParse(trimmed);
  if (!prepared.value) return "";

  const parsed = parsePhoneNumberFromString(prepared.value, defaultCountry);
  if (parsed && (parsed.isPossible() || parsed.isValid())) {
    return parsed.format("E.164");
  }

  // Only keep an unparsed digit string when the user clearly dialed internationally
  // (+ / 00 / 011 / RU 8…). Never invent a country code from a bare national number.
  if (prepared.hadInternationalIntent && isPlausibleE164Phone(prepared.value)) {
    return prepared.value;
  }
  return "";
}

/** Loose E.164 check: + then 8–15 digits, country-code first digit 1–9. */
export function isPlausibleE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

type Prepared = { value: string; hadInternationalIntent: boolean };

function prepareForParse(raw: string): Prepared {
  const empty: Prepared = { value: "", hadInternationalIntent: false };

  // Keep digits and plus; drop spaces, dashes, parentheses, etc.
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return empty;

  const hadPlus = s.includes("+");
  let digits = s.replace(/\+/g, "");
  if (!digits) return empty;

  // ITU international prefix 00… (Europe, most of the world)
  if (digits.startsWith("00")) {
    digits = digits.replace(/^00+/, "");
    if (!digits) return empty;
    return { value: `+${digits}`, hadInternationalIntent: true };
  }

  // NANP international prefix 011… (US / Canada / Caribbean dialing abroad)
  if (digits.startsWith("011") && digits.length > 3) {
    digits = digits.slice(3).replace(/^0+/, "");
    if (!digits) return empty;
    return { value: `+${digits}`, hadInternationalIntent: true };
  }

  // Russian / Kazakh national trunk: 8 + 10 digits → country code 7
  if (/^8\d{10}$/.test(digits)) {
    return { value: `+7${digits.slice(1)}`, hadInternationalIntent: true };
  }

  if (hadPlus) {
    if (!/^[1-9]/.test(digits)) return empty;
    return { value: `+${digits}`, hadInternationalIntent: true };
  }

  // Digits only: assume already includes country calling code (Telegram requires it).
  // libphonenumber decides whether it's a possible number.
  if (/^[1-9]/.test(digits)) {
    return { value: `+${digits}`, hadInternationalIntent: false };
  }

  return empty;
}
