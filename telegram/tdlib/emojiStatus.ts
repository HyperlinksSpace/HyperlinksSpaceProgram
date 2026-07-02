export { parseCustomEmojiId, readCustomEmojiIdField } from "../../shared/telegramCustomEmojiId.js";
import { readCustomEmojiIdField } from "../../shared/telegramCustomEmojiId.js";

/**
 * Read `custom_emoji_id` from a TDLib {@link emojiStatus} object.
 * Premium emoji statuses always resolve through getCustomEmojiStickers.
 */
export function parseEmojiStatusCustomId(status: unknown): string | null {
  if (status == null) return null;
  if (typeof status !== "object") return null;

  const row = status as Record<string, unknown>;
  const direct = readCustomEmojiIdField(row);
  if (direct) return direct;

  const typeName = row._;
  if (
    typeName === "emojiStatusTypeCustomEmoji" ||
    typeName === "emojiStatusTypeCustom"
  ) {
    return readCustomEmojiIdField(row);
  }

  const type = row.type;
  if (!type || typeof type !== "object") return null;

  const typeRow = type as Record<string, unknown>;
  if (
    typeRow._ === "emojiStatusTypeCustomEmoji" ||
    typeRow._ === "emojiStatusTypeCustom"
  ) {
    return readCustomEmojiIdField(typeRow);
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

function readChatEmojiStatusField(chat: Record<string, unknown>): unknown {
  if ("emoji_status" in chat) return chat.emoji_status;
  if ("emojiStatus" in chat) return chat.emojiStatus;
  return null;
}

/** Channel / supergroup emoji status shown beside the chat title. */
export function emojiStatusCustomIdFromChat(chat: unknown): string | null {
  if (!chat || typeof chat !== "object") return null;
  return parseEmojiStatusCustomId(readChatEmojiStatusField(chat as Record<string, unknown>));
}
