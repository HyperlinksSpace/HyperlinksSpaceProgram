/** Parse TDLib int64 custom emoji ids (string, number, bigint, or tdl wrappers). */
export function parseCustomEmojiId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(Math.trunc(value));
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.value === "string" && row.value.trim()) return row.value.trim();
    if (typeof row.value === "number" && Number.isFinite(row.value) && row.value > 0) {
      return String(Math.trunc(row.value));
    }
    if (typeof row.value === "bigint" && row.value > 0n) return row.value.toString();
  }
  return null;
}

/** Read custom emoji id fields from TDLib objects (snake_case and camelCase). */
export function readCustomEmojiIdField(row: Record<string, unknown>): string | null {
  return (
    parseCustomEmojiId(row.custom_emoji_id) ??
    parseCustomEmojiId(row.customEmojiId) ??
    null
  );
}
