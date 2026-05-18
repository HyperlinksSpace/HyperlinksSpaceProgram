const STORAGE_KEY = "hyperlinks_welcome_feed_manual_translation_v1";

/** When true, welcome feed copy follows UI locale; when false, Telegram language rules only. */
export function readStoredWelcomeFeedManualTranslation(): boolean {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(
        STORAGE_KEY,
      );
      return raw === "1" || raw === "true";
    }
  } catch {
    /* private mode / SSR */
  }
  return false;
}

export function writeStoredWelcomeFeedManualTranslation(enabled: boolean): void {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
      if (enabled) ls.setItem(STORAGE_KEY, "1");
      else ls.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
