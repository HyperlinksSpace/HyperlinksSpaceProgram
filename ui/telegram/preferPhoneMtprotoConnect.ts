import { Platform } from "react-native";
import { isActuallyInTelegram } from "../components/telegramWebApp";

/** Phone + in-app code works on the same device; QR / tg:// links often do not inside Telegram. */
export function preferPhoneMtprotoConnect(): boolean {
  return isActuallyInTelegram() || Platform.OS === "ios" || Platform.OS === "android";
}
