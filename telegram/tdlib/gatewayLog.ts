import { appLog } from "../../shared/appLog.js";

/** Filter DevTools with `[tdlib-gateway]`. */
export const TDLIB_GATEWAY_LOG_TAG = "[tdlib-gateway]";

export function logGateway(event: string, details?: Record<string, unknown>): void {
  appLog(TDLIB_GATEWAY_LOG_TAG, event, details);
}
