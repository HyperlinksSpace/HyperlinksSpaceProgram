import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import {
  isPlausibleE164Phone,
  normalizeTelegramAuthPhone,
} from "./normalizePhoneNumber";

/** Mask E.164 for DevTools: +***3911 (last 4 digits visible). */
export function maskPhoneForConnectLog(phone: string | undefined | null): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const prefix = trimmed.startsWith("+") ? "+" : "";
  return `${prefix}***${digits.slice(-4)}`;
}

export type ConnectPhoneClientDebug = {
  rawInputLength: number;
  rawInputHadPlus: boolean;
  rawInputDigitCount: number;
  defaultCountry: string | null;
  browserLanguageTags: string[];
  normalizedE164Masked: string | null;
  normalizedPlausible: boolean;
  parsedCountry: string | null;
  parsedCountryCallingCode: string | null;
  parsedNationalNumberLength: number | null;
  libPhoneValid: boolean;
  libPhonePossible: boolean;
};

export type ConnectPhoneTelegramReactionDebug = {
  receivedFromClientE164Masked: string | null;
  gatewayNormalizedE164Masked: string | null;
  clientGatewayNumberMatch: boolean;
  defaultCountry: string | null;
  isCurrentPhoneNumber: boolean;
  tdlibAuthSettings: {
    allow_flash_call: boolean;
    allow_missed_call: boolean;
    is_current_phone_number: boolean;
    has_unknown_phone_number: boolean;
    allow_sms_retriever_api: boolean;
  };
  connectionState: string | null;
  authStateAfter: string;
  tdlibInvokeError: string | null;
  authorizationStateType: string | null;
  telegramCodeDeliveryType: string | null;
  telegramNextCodeType: string | null;
  telegramTimeoutSec: number | null;
  telegramPhoneMasked: string | null;
  telegramCodeLength: number | null;
  telegramPhoneLast4MatchesSent: boolean | null;
  connectError: string | null;
  deliveryNote: string;
};

export type ConnectPhoneSubmitDebug = {
  client?: ConnectPhoneClientDebug | null;
  telegram: ConnectPhoneTelegramReactionDebug;
};

export function phoneLastFourDigits(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits || null;
}

export function phonesShareLastFour(a: string | undefined | null, b: string | undefined | null): boolean | null {
  const la = phoneLastFourDigits(a);
  const lb = phoneLastFourDigits(b);
  if (!la || !lb) return null;
  return la === lb;
}

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

export function describeTelegramCodeDeliveryForDebug(input: {
  authState: string;
  codeDeliveryType: string | null;
  nextCodeType: string | null;
  timeoutSec: number | null;
  error: string | null;
  phoneLast4MatchesSent: boolean | null;
}): string {
  if (input.error && input.authState !== "wait_code") {
    return `Telegram/TDLib rejected or stalled phone auth: ${input.error}`;
  }
  if (input.authState === "wait_code" && input.codeDeliveryType === "authenticationCodeTypeTelegramMessage") {
    const resend =
      input.nextCodeType != null
        ? `Alternate delivery later: ${input.nextCodeType}.`
        : "No alternate delivery (Resend unavailable until Telegram allows it).";
    const match =
      input.phoneLast4MatchesSent === false
        ? " WARNING: Telegram's masked phone last digits do not match what we sent — check country code / formatting."
        : input.phoneLast4MatchesSent === true
          ? " Telegram reports the same phone last digits as sent."
          : "";
    return (
      `Telegram accepted the number and chose in-app delivery (service chat on an existing session, not SMS). ` +
      `${resend}${match}`
    );
  }
  if (input.authState === "wait_code") {
    return `Telegram accepted the number; code delivery type: ${input.codeDeliveryType ?? "unknown"}.`;
  }
  if (input.authState === "wait_password") {
    return "Telegram accepted the number; two-step verification password required next.";
  }
  if (input.authState === "ready") {
    return "Telegram authorized immediately (session already valid).";
  }
  return `Auth state after phone submit: ${input.authState}.`;
}

export function buildConnectPhoneTelegramReactionDebug(input: {
  receivedPhone: string;
  normalizedPhone: string;
  defaultCountry?: CountryCode;
  isCurrentPhoneNumber: boolean;
  connectionState: string | null;
  authStateAfter: string;
  invokeError: string | null;
  authorizationStateType: string | null;
  codeDelivery: {
    type: string | null;
    nextType: string | null;
    timeoutSec: number | null;
    phoneMasked: string | null;
    codeLength: number | null;
  } | null;
  connectError: string | null;
}): ConnectPhoneTelegramReactionDebug {
  const received = input.receivedPhone.trim();
  const normalized = input.normalizedPhone.trim();
  const clientGatewayNumberMatch = received === normalized;
  const telegramPhoneLast4MatchesSent = phonesShareLastFour(
    normalized,
    input.codeDelivery?.phoneMasked ?? null,
  );

  return {
    receivedFromClientE164Masked: maskPhoneForConnectLog(received),
    gatewayNormalizedE164Masked: maskPhoneForConnectLog(normalized),
    clientGatewayNumberMatch,
    defaultCountry: input.defaultCountry ?? null,
    isCurrentPhoneNumber: input.isCurrentPhoneNumber,
    tdlibAuthSettings: {
      allow_flash_call: false,
      allow_missed_call: false,
      is_current_phone_number: input.isCurrentPhoneNumber,
      has_unknown_phone_number: false,
      allow_sms_retriever_api: false,
    },
    connectionState: input.connectionState,
    authStateAfter: input.authStateAfter,
    tdlibInvokeError: input.invokeError,
    authorizationStateType: input.authorizationStateType,
    telegramCodeDeliveryType: input.codeDelivery?.type ?? null,
    telegramNextCodeType: input.codeDelivery?.nextType ?? null,
    telegramTimeoutSec: input.codeDelivery?.timeoutSec ?? null,
    telegramPhoneMasked: input.codeDelivery?.phoneMasked ?? null,
    telegramCodeLength: input.codeDelivery?.codeLength ?? null,
    telegramPhoneLast4MatchesSent,
    connectError: input.connectError,
    deliveryNote: describeTelegramCodeDeliveryForDebug({
      authState: input.authStateAfter,
      codeDeliveryType: input.codeDelivery?.type ?? null,
      nextCodeType: input.codeDelivery?.nextType ?? null,
      timeoutSec: input.codeDelivery?.timeoutSec ?? null,
      error: input.connectError,
      phoneLast4MatchesSent: telegramPhoneLast4MatchesSent,
    }),
  };
}
