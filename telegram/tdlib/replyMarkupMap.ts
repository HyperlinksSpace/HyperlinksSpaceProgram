/**
 * Map TDLib `reply_markup` (inline keyboards) into a JSON-safe payload for the app UI.
 */

export type MappedInlineKeyboardButtonType =
  | { kind: "callback"; data: string }
  | { kind: "url"; url: string }
  | { kind: "web_app"; url: string }
  | { kind: "login_url"; url: string; id: number; forward_text: string | null }
  | { kind: "switch_inline"; query: string; in_current_chat: boolean }
  | { kind: "user"; user_id: number }
  | { kind: "buy" }
  | { kind: "callback_game" }
  | { kind: "copy_text"; text: string }
  | { kind: "unsupported"; type: string };

export type MappedInlineKeyboardButton = {
  text: string;
  type: MappedInlineKeyboardButtonType;
};

export type MappedInlineKeyboard = {
  kind: "inline";
  rows: MappedInlineKeyboardButton[][];
};

export type MappedReplyMarkup = MappedInlineKeyboard;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapInlineButtonType(raw: unknown): MappedInlineKeyboardButtonType {
  const row = asRecord(raw);
  const type = readString(row?._);
  switch (type) {
    case "inlineKeyboardButtonTypeCallback":
      return { kind: "callback", data: readString(row?.data) };
    case "inlineKeyboardButtonTypeCallbackWithPassword":
      return { kind: "callback", data: readString(row?.data) };
    case "inlineKeyboardButtonTypeUrl":
      return { kind: "url", url: readString(row?.url) };
    case "inlineKeyboardButtonTypeWebApp":
      return { kind: "web_app", url: readString(row?.url) };
    case "inlineKeyboardButtonTypeLoginUrl":
      return {
        kind: "login_url",
        url: readString(row?.url),
        id: Number(row?.id) || 0,
        forward_text: readString(row?.forward_text) || null,
      };
    case "inlineKeyboardButtonTypeSwitchInline": {
      const target = asRecord(row?.target_chat);
      const inCurrent =
        target?._ === "targetChatCurrent" ||
        target?._ === "targetChatChosen" ||
        !target;
      return {
        kind: "switch_inline",
        query: readString(row?.query),
        in_current_chat: Boolean(inCurrent),
      };
    }
    case "inlineKeyboardButtonTypeUser":
      return { kind: "user", user_id: Number(row?.user_id) || 0 };
    case "inlineKeyboardButtonTypeBuy":
      return { kind: "buy" };
    case "inlineKeyboardButtonTypeCallbackGame":
      return { kind: "callback_game" };
    case "inlineKeyboardButtonTypeCopyText":
      return { kind: "copy_text", text: readString(row?.text) };
    default:
      return { kind: "unsupported", type: type || "unknown" };
  }
}

function mapInlineButton(raw: unknown): MappedInlineKeyboardButton | null {
  const row = asRecord(raw);
  if (!row) return null;
  const text = readString(row.text).trim();
  if (!text) return null;
  return {
    text,
    type: mapInlineButtonType(row.type),
  };
}

/** Extract inline keyboard markup from a TDLib message (or null). */
export function mapReplyMarkupFromTdMessage(
  message: { reply_markup?: unknown } | null | undefined,
): MappedReplyMarkup | null {
  const markup = asRecord(message?.reply_markup);
  if (!markup) return null;
  if (markup._ !== "replyMarkupInlineKeyboard") return null;
  const rowsRaw = Array.isArray(markup.rows) ? markup.rows : [];
  const rows: MappedInlineKeyboardButton[][] = [];
  for (const rowRaw of rowsRaw) {
    if (!Array.isArray(rowRaw)) continue;
    const buttons: MappedInlineKeyboardButton[] = [];
    for (const buttonRaw of rowRaw) {
      const button = mapInlineButton(buttonRaw);
      if (button) buttons.push(button);
    }
    if (buttons.length > 0) rows.push(buttons);
  }
  if (rows.length === 0) return null;
  return { kind: "inline", rows };
}

/** Normalize a wire/JSON reply_markup payload from the gateway. */
export function normalizeMappedReplyMarkup(raw: unknown): MappedReplyMarkup | null {
  const row = asRecord(raw);
  if (!row) return null;
  if (row.kind !== "inline" && row._ !== "replyMarkupInlineKeyboard") return null;
  const rowsRaw = Array.isArray(row.rows) ? row.rows : [];
  const rows: MappedInlineKeyboardButton[][] = [];
  for (const rowRaw of rowsRaw) {
    if (!Array.isArray(rowRaw)) continue;
    const buttons: MappedInlineKeyboardButton[] = [];
    for (const buttonRaw of rowRaw) {
      const buttonRow = asRecord(buttonRaw);
      if (!buttonRow) continue;
      const text = readString(buttonRow.text).trim();
      if (!text) continue;
      const typeRaw = buttonRow.type;
      let type: MappedInlineKeyboardButtonType;
      if (typeRaw && typeof typeRaw === "object" && !Array.isArray(typeRaw)) {
        const t = typeRaw as Record<string, unknown>;
        if (typeof t.kind === "string") {
          type = t as MappedInlineKeyboardButtonType;
        } else {
          type = mapInlineButtonType(t);
        }
      } else {
        type = { kind: "unsupported", type: "unknown" };
      }
      buttons.push({ text, type });
    }
    if (buttons.length > 0) rows.push(buttons);
  }
  if (rows.length === 0) return null;
  return { kind: "inline", rows };
}
