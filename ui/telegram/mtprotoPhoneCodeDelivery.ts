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
 * `is_current_phone_number` only makes sense when TDLib runs on the same device as the phone
 * (local gateway). Remote gateways (Railway) must use SMS / Telegram cloud code delivery instead.
 */
export function mtprotoUseCurrentPhoneNumberForCode(): boolean {
  return isLocalDevApiBase() && (isActuallyInTelegram() || Platform.OS === "ios" || Platform.OS === "android");
}
