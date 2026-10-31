import { appLog } from "../../shared/appLog";
import type { ConnectCodeDeliveryInfo } from "./formatConnectCodeDelivery";

/** Filter DevTools console with `[telegram-connect]`. */
export const TELEGRAM_CONNECT_LOG_PREFIX = "[telegram-connect]";

export function logTelegramConnect(
  step: string,
  details?: Record<string, unknown>,
): void {
  appLog(TELEGRAM_CONNECT_LOG_PREFIX, step, details);
}

export type ConnectPhoneApiResponseBody = {
  ok?: boolean;
  attemptId?: string | null;
  authState?: string | null;
  error?: string | null;
  chatCount?: number | null;
  messengerSlot?: number | null;
  qrLink?: string | null;
  codeDelivery?: ConnectCodeDeliveryInfo | null;
};

/** Logs TDLib/Telegram auth outcome from POST /api/telegram-mtproto-connect-phone (DevTools: `[telegram-connect]`). */
export function logConnectPhoneTelegramResponse(
  httpStatus: number,
  body: ConnectPhoneApiResponseBody,
  requestMeta?: Record<string, unknown>,
): void {
  logTelegramConnect("connect_phone_telegram_response", {
    httpStatus,
    request: requestMeta ?? null,
    ok: body.ok ?? null,
    attemptId: body.attemptId ?? null,
    messengerSlot: body.messengerSlot ?? null,
    chatCount: body.chatCount ?? null,
    telegramAuthState: body.authState ?? null,
    telegramError: body.error ?? null,
    telegramCodeDelivery: body.codeDelivery ?? null,
    apiBody: body,
  });
}
