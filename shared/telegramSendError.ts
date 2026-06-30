export const TELEGRAM_SEND_ERROR_PUBLIC_GROUPS_BANNED = "public_groups_banned" as const;

function extractErrorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const row = err as Record<string, unknown>;
    const parts = [row.message, row.code, row._];
    return parts.filter((part) => typeof part === "string").join(" ");
  }
  return String(err);
}

/** Map TDLib send failures to stable client-facing error codes. */
export function classifyTdlibSendError(err: unknown, chatId?: number): string {
  const text = extractErrorText(err);
  const lower = text.toLowerCase();

  if (
    /public\s+groups?/.test(lower) ||
    lower.includes("participating in public") ||
    (lower.includes("banned from") && lower.includes("group"))
  ) {
    return TELEGRAM_SEND_ERROR_PUBLIC_GROUPS_BANNED;
  }

  const isGroupLike = typeof chatId === "number" && chatId < 0;
  if (isGroupLike && (lower.includes("user_restricted") || lower.includes("user restricted"))) {
    return TELEGRAM_SEND_ERROR_PUBLIC_GROUPS_BANNED;
  }

  if (err instanceof Error && err.message) return err.message;
  if (text) return text;
  return "send_failed";
}
