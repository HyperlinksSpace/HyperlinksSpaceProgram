import { Platform } from "react-native";
import { getApiBaseUrl } from "../../api/_base";
import { isActuallyInTelegram } from "../components/telegramWebApp";

function isLocalDevApiBase(): boolean {
  try {
    const base = getApiBaseUrl();
    return /localhost|127\.0\.0\.1|192\.168\.|10\./.test(base);
  } catch {
    return false;
  }
}

/**
 * Phone-first connect only when TDLib runs locally on the same device as Telegram.
 * Production cloud gateway must default to QR (reliable); phone codes are TelegramMessage-only.
 */
export function preferPhoneMtprotoConnect(): boolean {
  return isLocalDevApiBase() && (isActuallyInTelegram() || Platform.OS === "ios" || Platform.OS === "android");
}
