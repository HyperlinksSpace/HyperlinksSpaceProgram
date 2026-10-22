/**
 * Telegram "Saved Messages" is the private chat with yourself.
 * Clients localize the title (lng_saved_messages) and match search across locales.
 */

/** Titles / prefixes users type in EN / RU / ZH (and short stems like "sav"). */
export const SAVED_MESSAGES_SEARCH_ALIASES = [
  "saved messages",
  "saved",
  "избранное",
  "избр",
  "收藏",
  "收藏夹",
] as const;

export function normalizeSavedMessagesSearchNeedle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

/** True when the query should surface Saved Messages (Telegram Desktop behavior). */
export function savedMessagesQueryMatches(query: string): boolean {
  const needle = normalizeSavedMessagesSearchNeedle(query);
  if (!needle) return false;
  for (const alias of SAVED_MESSAGES_SEARCH_ALIASES) {
    const a = normalizeSavedMessagesSearchNeedle(alias);
    if (!a) continue;
    if (a.startsWith(needle) || needle.startsWith(a)) return true;
  }
  return false;
}

export function isSavedMessagesPeer(
  peerUserId: number | null | undefined,
  selfUserId: number | null | undefined,
): boolean {
  if (peerUserId == null || selfUserId == null) return false;
  if (!Number.isFinite(peerUserId) || !Number.isFinite(selfUserId)) return false;
  if (peerUserId <= 0 || selfUserId <= 0) return false;
  return Math.trunc(peerUserId) === Math.trunc(selfUserId);
}
