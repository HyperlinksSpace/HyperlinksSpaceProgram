import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { openTelegramDeepLink } from "../../telegram/openTelegramDeepLink";

type TelegramWebAppBridge = {
  openTelegramLink?: (url: string) => void;
};

function getTelegramWebApp(): TelegramWebAppBridge | null {
  if (typeof window === "undefined") return null;
  const tg = (window as { Telegram?: { WebApp?: TelegramWebAppBridge } }).Telegram?.WebApp;
  return tg ?? null;
}

/** Open http(s), t.me, or tg:// links from chat message text. */
export function openMessageLinkUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (/^tg:\/\//i.test(trimmed)) {
    openTelegramDeepLink(trimmed);
    return;
  }

  const webApp = getTelegramWebApp();
  if (webApp?.openTelegramLink && /^https?:\/\/t\.me\//i.test(trimmed)) {
    webApp.openTelegramLink(trimmed);
    return;
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(trimmed, "_blank", "noopener,noreferrer");
    return;
  }

  void Linking.openURL(trimmed);
}
