/** Survives reload — user chose Exit Telegram in the side menu (not app sign-out). */
const STORAGE_KEY = "hs_telegram_messages_explicit_disconnect_v1";

function storageKeyForUsername(telegramUsername: string): string {
  return `${STORAGE_KEY}:${telegramUsername.trim().toLowerCase()}`;
}

export function markTelegramMessagesExplicitDisconnect(telegramUsername: string): void {
  if (typeof window === "undefined" || !telegramUsername.trim()) return;
  try {
    window.localStorage.setItem(storageKeyForUsername(telegramUsername), "1");
  } catch {
    // ignore
  }
}

export function clearTelegramMessagesExplicitDisconnect(telegramUsername: string): void {
  if (typeof window === "undefined" || !telegramUsername.trim()) return;
  try {
    window.localStorage.removeItem(storageKeyForUsername(telegramUsername));
  } catch {
    // ignore
  }
}

export function hasTelegramMessagesExplicitDisconnect(telegramUsername: string | null | undefined): boolean {
  if (typeof window === "undefined" || !telegramUsername?.trim()) return false;
  try {
    return window.localStorage.getItem(storageKeyForUsername(telegramUsername)) === "1";
  } catch {
    return false;
  }
}
