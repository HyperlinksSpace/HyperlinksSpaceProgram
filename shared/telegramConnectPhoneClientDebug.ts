import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import {
  isPlausibleE164Phone,
  normalizeTelegramAuthPhone,
} from "./normalizePhoneNumber.js";
import { maskPhoneForConnectLog, type ConnectPhoneClientDebug } from "./telegramConnectPhoneDebug.js";

export type { ConnectPhoneClientDebug };

export function buildConnectPhoneClientDebug(
  raw: string,
  context?: {
    defaultCountry?: CountryCode;
    languageTags?: readonly string[];
    appLocale?: string;
  },
): ConnectPhoneClientDebug {
  const trimmed = raw.trim();
  const normalized = normalizeTelegramAuthPhone(raw, context);
  const parsed = normalized
    ? parsePhoneNumberFromString(normalized)
    : parsePhoneNumberFromString(trimmed, context?.defaultCountry);

  return {
    rawInputLength: trimmed.length,
    rawInputHadPlus: trimmed.includes("+"),
    rawInputDigitCount: trimmed.replace(/\D/g, "").length,
    defaultCountry: context?.defaultCountry ?? null,
    browserLanguageTags: context?.languageTags ? [...context.languageTags].slice(0, 5) : [],
    normalizedE164Masked: maskPhoneForConnectLog(normalized),
    normalizedPlausible: isPlausibleE164Phone(normalized),
    parsedCountry: parsed?.country ?? null,
    parsedCountryCallingCode: parsed?.countryCallingCode != null ? String(parsed.countryCallingCode) : null,
    parsedNationalNumberLength: parsed?.nationalNumber?.length ?? null,
    libPhoneValid: parsed?.isValid() ?? false,
    libPhonePossible: parsed?.isPossible() ?? false,
  };
}
