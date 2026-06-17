import * as Linking from "expo-linking";

type TelegramWebAppBridge = {
  openTelegramLink?: (url: string) => void;
};

function getTelegramWebApp(): TelegramWebAppBridge | null {
  if (typeof window === "undefined") return null;
  const tg = (window as { Telegram?: { WebApp?: TelegramWebAppBridge } }).Telegram?.WebApp;
  return tg ?? null;
}

/** Open a `tg://` login link — uses TMA bridge when inside Telegram, otherwise system browser. */
export function openTelegramDeepLink(link: string): void {
  const trimmed = link.trim();
  if (!trimmed) return;

  const webApp = getTelegramWebApp();
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(trimmed);
    return;
  }

  void Linking.openURL(trimmed);
}
