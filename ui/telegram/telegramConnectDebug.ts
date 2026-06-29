import { appLog } from "../../shared/appLog";

/** Filter DevTools console with `[telegram-connect]`. */
export const TELEGRAM_CONNECT_LOG_PREFIX = "[telegram-connect]";

export function logTelegramConnect(
  step: string,
  details?: Record<string, unknown>,
): void {
  appLog(TELEGRAM_CONNECT_LOG_PREFIX, step, details);
}
