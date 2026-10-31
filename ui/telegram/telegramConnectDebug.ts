import { appLog } from "../../shared/appLog";
import type { ConnectCodeDeliveryInfo } from "./formatConnectCodeDelivery";
import type { ConnectPhoneSubmitDebug } from "../../shared/telegramConnectPhoneDebug";

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
  phoneDebug?: ConnectPhoneSubmitDebug | null;
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
    phoneDebug: body.phoneDebug ?? null,
    apiBody: body,
  });
}

/**
 * One consolidated console record: what you typed → what we sent → Telegram/TDLib reaction.
 * Filter DevTools with `[telegram-connect] connect_phone_debug_complete`.
 */
export function logConnectPhoneDebugComplete(
  httpStatus: number,
  body: ConnectPhoneApiResponseBody,
  clientDebugBeforeRequest?: ConnectPhoneSubmitDebug["client"],
): void {
  const phoneDebug = body.phoneDebug ?? null;
  const telegram = phoneDebug?.telegram ?? null;
  logTelegramConnect("connect_phone_debug_complete", {
    httpStatus,
    attemptId: body.attemptId ?? null,
    ok: body.ok ?? null,
    authState: body.authState ?? null,
    error: body.error ?? null,
    codeDelivery: body.codeDelivery ?? null,
    client: clientDebugBeforeRequest ?? phoneDebug?.client ?? null,
    telegram,
    gatewayPhoneDebugFromTdlib: Boolean(body.phoneDebug?.telegram && body.phoneDebug?.telegram.connectionState != null),
    summary: telegram?.deliveryNote ?? null,
  });
  if (telegram?.deliveryNote) {
    logTelegramConnect("connect_phone_debug_summary", { message: telegram.deliveryNote });
  }
}
