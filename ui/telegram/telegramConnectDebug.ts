/** Filter DevTools console with `[telegram-connect]`. */
export const TELEGRAM_CONNECT_LOG_PREFIX = "[telegram-connect]";

export function logTelegramConnect(
  step: string,
  details?: Record<string, unknown>,
): void {
  const payload = details ? { step, ...details } : { step };
  try {
    console.log(`${TELEGRAM_CONNECT_LOG_PREFIX} ${JSON.stringify(payload)}`);
  } catch {
    console.log(TELEGRAM_CONNECT_LOG_PREFIX, step, details ?? "");
  }
}
