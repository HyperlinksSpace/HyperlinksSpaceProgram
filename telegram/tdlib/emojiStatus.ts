/** Parse TDLib int64 custom emoji ids (string or number). */
export function parseCustomEmojiId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "bigint" && value > 0n) return value.toString();
  return null;
}

/**
 * Read `custom_emoji_id` from a TDLib {@link emojiStatus} object.
 * Premium emoji statuses always resolve through getCustomEmojiStickers.
 */
export function parseEmojiStatusCustomId(status: unknown): string | null {
  if (status == null) return null;
  if (typeof status !== "object") return null;

  const row = status as Record<string, unknown>;
  const direct = parseCustomEmojiId(row.custom_emoji_id);
  if (direct) return direct;

  const type = row.type;
  if (!type || typeof type !== "object") return null;

  const typeRow = type as Record<string, unknown>;
  if (
    typeRow._ === "emojiStatusTypeCustomEmoji" ||
    typeRow._ === "emojiStatusTypeCustom"
  ) {
    return parseCustomEmojiId(typeRow.custom_emoji_id);
  }

  return null;
}

function readUserEmojiStatusField(user: Record<string, unknown>): unknown {
  if ("emoji_status" in user) return user.emoji_status;
  if ("emojiStatus" in user) return user.emojiStatus;
  return null;
}

export function emojiStatusCustomIdFromUser(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  return parseEmojiStatusCustomId(readUserEmojiStatusField(user as Record<string, unknown>));
}
