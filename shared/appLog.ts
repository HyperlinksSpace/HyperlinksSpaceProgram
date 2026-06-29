/** Compact one-line logs: `[tag] event k=v …` — filter DevTools by tag, easy to copy. */
export type AppLogDetails = Record<string, unknown>;

/** Telegram user ids are safe to log; omit null/0/NaN (invalid or placeholder). */
export function safeTelegramUserIdForLog(userId: unknown): number | undefined {
  const id = typeof userId === "bigint" ? Number(userId) : Number(userId);
  if (!Number.isFinite(id) || id <= 0) return undefined;
  return Math.trunc(id);
}

/** `{ userId: 123 }` or `{}` when the id is not a valid Telegram user id. */
export function telegramUserIdLogField(
  userId: unknown,
  key = "userId",
): Record<string, number> {
  const id = safeTelegramUserIdForLog(userId);
  return id != null ? { [key]: id } : {};
}

function serializeValue(value: unknown): string {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") {
    if (!value) return '""';
    if (/[\s="']/.test(value)) return JSON.stringify(value);
    return value;
  }
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatDetails(details?: AppLogDetails): string {
  if (!details) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    const serialized = serializeValue(value);
    if (serialized === "") continue;
    parts.push(`${key}=${serialized}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function appLog(tag: string, event: string, details?: AppLogDetails): void {
  console.log(`${tag} ${event}${formatDetails(details)}`);
}

export function appWarn(tag: string, event: string, details?: AppLogDetails): void {
  console.warn(`${tag} ${event}${formatDetails(details)}`);
}

export function appError(
  tag: string,
  event: string,
  details?: AppLogDetails,
  err?: unknown,
): void {
  const merged: AppLogDetails = { ...details };
  if (err !== undefined) {
    merged.err = err instanceof Error ? err.message : err;
  }
  console.error(`${tag} ${event}${formatDetails(merged)}`);
}

/** For payloads shaped as `{ event, ...details }` (legacy JSON log objects). */
export function appLogEvent(tag: string, payload: AppLogDetails): void {
  const { event, ...rest } = payload;
  appLog(tag, typeof event === "string" ? event : "log", rest);
}
