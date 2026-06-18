import { getApiBaseUrl } from "../../api/_base";

function isLocalDevApiBase(): boolean {
  try {
    const base = getApiBaseUrl();
    return /localhost|127\.0\.0\.1|192\.168\.|10\./.test(base);
  } catch {
    return false;
  }
}

/** TDLib runs on Railway / remote host — phone codes use TelegramMessage, not SMS. */
export function isCloudMtprotoGateway(): boolean {
  return !isLocalDevApiBase();
}
