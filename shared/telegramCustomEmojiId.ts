/** Parse TDLib int64 custom emoji ids (string, number, bigint, or tdl wrappers). */
export function parseCustomEmojiId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    if (!Number.isSafeInteger(value)) return null;
    return String(Math.trunc(value));
  }
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.value === "string" && row.value.trim()) return row.value.trim();
    if (typeof row.value === "number" && Number.isFinite(row.value) && row.value > 0) {
      if (!Number.isSafeInteger(row.value)) return null;
      return String(Math.trunc(row.value));
    }
    if (typeof row.value === "bigint" && row.value > 0n) return row.value.toString();
  }
  return null;
}

/** Coerce a parsed id for TDLib `getCustomEmojiStickers` (int64 as string — tdl cannot serialize BigInt). */
export function tdlibCustomEmojiIdParam(id: string): string {
  return id.trim();
}

/** Parse TDLib int32 file ids (plain number, string, bigint, or tdl int64 wrapper). */
export function parseTdlibFileId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "bigint" && value > 0n) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (row.value != null) return parseTdlibFileId(row.value);
    if (row.id != null) return parseTdlibFileId(row.id);
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
