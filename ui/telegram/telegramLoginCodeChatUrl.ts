import { openUrlInNewTabStrict } from "../openExternalUrl";
import { logTelegramConnect } from "./telegramConnectDebug";

/** Official Telegram service chat for login codes (+42777). Opens in a new browser tab on web. */
export const TELEGRAM_LOGIN_CODE_CHAT_URL = "https://t.me/+42777";

export function openTelegramLoginCodeChat(): void {
  logTelegramConnect("connect_open_telegram_code_chat", {
    url: TELEGRAM_LOGIN_CODE_CHAT_URL,
    newTab: true,
  });
  openUrlInNewTabStrict(TELEGRAM_LOGIN_CODE_CHAT_URL);
}
