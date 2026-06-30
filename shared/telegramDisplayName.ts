/** Hangul filler and other chars Telegram users set as “empty” display names. */
const INVISIBLE_NAME_CHARS =
  /[\u3164\u115f\u200b-\u200d\u2060\ufeff\u00ad\u034f\u061c\u17b4\u17b5\u180e]/g;

export function stripInvisibleDisplayNameChars(value: string): string {
  return value.replace(INVISIBLE_NAME_CHARS, "");
}

export function isEffectivelyBlankDisplayName(value: string | null | undefined): boolean {
  if (value == null) return true;
  return stripInvisibleDisplayNameChars(value).trim().length === 0;
}

/** Pick a visible label — real name, @username, or a short user id fallback. */
export function resolveTelegramDisplayName(params: {
  name?: string | null;
  username?: string | null;
  userId?: number | null;
}): string {
  const visibleName = stripInvisibleDisplayNameChars(params.name ?? "").trim();
  if (visibleName) return visibleName;

  const username = (params.username ?? "").trim().replace(/^@+/, "");
  if (username) return `@${username}`;

  const userId = Number(params.userId);
  if (Number.isFinite(userId) && userId > 0) return `User ${userId}`;

  return "User";
}
