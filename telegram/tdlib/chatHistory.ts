import type { Client } from "tdl";
import {
  chatTitle,
  messageDisplayText,
  previewFromMessage,
  type TdChat,
  type TdMessage,
} from "./chatPreview.js";

export type MappedChatHistoryMessage = {
  telegram_message_id: number;
  text: string;
  sent_at: string;
  sender_name: string;
  sender_user_id: number | null;
  is_outgoing: boolean;
};

type TdUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

function senderUserId(message: TdMessage): number | null {
  const sender = message.sender_id;
  if (sender?._ === "messageSenderUser" && typeof sender.user_id === "number") {
    return sender.user_id;
  }
  return null;
}

function messageSentAtIso(message: TdMessage): string {
  const ts = message.date;
  if (typeof ts === "number" && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function resolveSenderName(
  client: Client,
  message: TdMessage,
  chat: TdChat,
  cache: Map<number, string>,
): Promise<string> {
  const userId = senderUserId(message);
  if (userId != null) {
    const cached = cache.get(userId);
    if (cached) return cached;
    try {
      const user = (await client.invoke({ _: "getUser", user_id: userId })) as TdUser;
      const parts = [user.first_name, user.last_name].filter(
        (part): part is string => typeof part === "string" && part.trim().length > 0,
      );
      const name =
        parts.join(" ").trim() ||
        (typeof user.username === "string" && user.username.trim()
          ? `@${user.username.trim()}`
          : "User");
      cache.set(userId, name);
      return name;
    } catch {
      return "User";
    }
  }
  return chatTitle(chat);
}

export async function fetchChatHistory(
  client: Client,
  chatId: number,
  limit = 50,
): Promise<MappedChatHistoryMessage[]> {
  try {
    await client.invoke({ _: "openChat", chat_id: chatId });
  } catch {
    /* already open */
  }

  const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const history = (await client.invoke({
    _: "getChatHistory",
    chat_id: chatId,
    from_message_id: 0,
    offset: 0,
    limit: Math.min(Math.max(limit, 1), 100),
    only_local: false,
  })) as { messages?: TdMessage[] };

  const raw = Array.isArray(history.messages) ? history.messages : [];
  const nameCache = new Map<number, string>();
  const rows: MappedChatHistoryMessage[] = [];

  for (const message of raw) {
    const text = messageDisplayText(message) || previewFromMessage(message);
    if (!text?.trim()) continue;
    const telegramMessageId = Number(message.id);
    if (!Number.isFinite(telegramMessageId)) continue;
    rows.push({
      telegram_message_id: telegramMessageId,
      text: text.trim(),
      sent_at: messageSentAtIso(message),
      sender_name: await resolveSenderName(client, message, chat, nameCache),
      sender_user_id: senderUserId(message),
      is_outgoing: Boolean(message.is_outgoing),
    });
  }

  rows.sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  return rows;
}
