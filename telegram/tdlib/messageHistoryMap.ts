import type { Client } from "tdl";
import {
  chatTitle,
  formattedTextPlain,
  lastReadOutboxMessageIdFromChat,
  previewFromMessage,
  type TdChat,
  type TdMessage,
} from "./chatPreview.js";

export type ChatKind = "private" | "group" | "supergroup" | "channel";

export type MessageContentKind =
  | "text"
  | "photo"
  | "video"
  | "document"
  | "animation"
  | "sticker"
  | "call"
  | "other";

export type MessageOutgoingStatus = "pending" | "delivered" | "read" | "failed";

export type MappedChatHistoryMessage = {
  telegram_message_id: number;
  text: string;
  sent_at: string;
  sender_name: string;
  sender_user_id: number | null;
  sender_chat_id: number | null;
  sender_is_channel: boolean;
  is_outgoing: boolean;
  outgoing_status: MessageOutgoingStatus | null;
  content_kind: MessageContentKind;
  has_media: boolean;
  media_width?: number | null;
  media_height?: number | null;
  reply_to?: {
    sender_name: string;
    sender_user_id: number | null;
    text: string;
  } | null;
  /** Ended call was answered / had duration (messageCall only). */
  call_success?: boolean | null;
};

type TdUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function chatKindFromTdChat(chat: TdChat): ChatKind {
  const kind = chat.type?._;
  if (kind === "chatTypePrivate") return "private";
  if (kind === "chatTypeBasicGroup") return "group";
  if (kind === "chatTypeSupergroup") {
    const row = chat.type as { is_channel?: boolean };
    return row.is_channel ? "channel" : "supergroup";
  }
  if (kind === "chatTypeChannel") return "channel";
  return chat.id < 0 ? "supergroup" : "private";
}

export function isGroupLikeChatKind(kind: ChatKind): boolean {
  return kind === "group" || kind === "supergroup" || kind === "channel";
}

function messageContentKind(message: TdMessage): MessageContentKind {
  const type = message.content?._;
  if (type === "messageText") return "text";
  if (type === "messagePhoto") return "photo";
  if (type === "messageVideo") return "video";
  if (type === "messageDocument") return "document";
  if (type === "messageAnimation") return "animation";
  if (type === "messageSticker") return "sticker";
  if (type === "messageCall") return "call";
  return "other";
}

function isCallMessage(message: TdMessage): boolean {
  return message.content?._ === "messageCall";
}

function parseCallSuccess(message: TdMessage): boolean {
  const content = message.content;
  if (!content || typeof content !== "object" || (content as { _?: string })._ !== "messageCall") {
    return false;
  }
  const row = content as Record<string, unknown>;
  const duration = Number(row.duration);
  if (Number.isFinite(duration) && duration > 0) return true;
  const reason = (row.discard_reason as { _?: string } | undefined)?._;
  return (
    reason === "callDiscardReasonHungUp" || reason === "callDiscardReasonDisconnected"
  );
}

function mediaDimensions(message: TdMessage): { width: number | null; height: number | null } {
  const content = message.content;
  if (!content || typeof content !== "object") return { width: null, height: null };
  const row = content as Record<string, unknown>;
  const type = row._;
  if (type === "messagePhoto") {
    const photo = row.photo as { sizes?: Array<{ width?: number; height?: number }> } | undefined;
    const sizes = photo?.sizes;
    if (!Array.isArray(sizes) || sizes.length === 0) return { width: null, height: null };
    let bestW = 0;
    let bestH = 0;
    for (const size of sizes) {
      const w = Number(size.width);
      const h = Number(size.height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
      if (w * h > bestW * bestH) {
        bestW = w;
        bestH = h;
      }
    }
    return bestW > 0 ? { width: bestW, height: bestH } : { width: null, height: null };
  }
  if (type === "messageVideo" || type === "messageAnimation") {
    const media = (row.video ?? row.animation) as { width?: number; height?: number } | undefined;
    const w = Number(media?.width);
    const h = Number(media?.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  return { width: null, height: null };
}

function hasDisplayableMedia(message: TdMessage): boolean {
  const kind = messageContentKind(message);
  return kind === "photo" || kind === "video" || kind === "animation";
}

function captionText(message: TdMessage): string | null {
  const c = message.content;
  if (!c || typeof c !== "object") return null;
  const caption = formattedTextPlain((c as { caption?: unknown }).caption);
  return caption ?? null;
}

function bodyText(message: TdMessage): string {
  const c = message.content;
  if (!c || typeof c !== "object") return "";
  if (c._ === "messageText") {
    return formattedTextPlain((c as { text?: unknown }).text) ?? "";
  }
  const caption = captionText(message);
  if (caption) return caption;
  if (hasDisplayableMedia(message)) return "";
  return previewFromMessage(message) ?? "";
}

async function resolveReplyPreview(
  client: Client,
  message: TdMessage,
  userCache: Map<number, string>,
  chatCache: Map<number, { title: string; isChannel: boolean }>,
): Promise<{ sender_name: string; sender_user_id: number | null; text: string } | null> {
  const reply = message.reply_to;
  if (reply?._ !== "messageReplyMessage") return null;
  const chatId = reply.chat_id;
  const messageId = reply.message_id;
  if (typeof chatId !== "number" || typeof messageId !== "number") return null;
  try {
    const replied = (await client.invoke({
      _: "getMessage",
      chat_id: chatId,
      message_id: messageId,
    })) as TdMessage;
    const sender = await resolveSenderName(client, replied, { id: chatId } as TdChat, userCache, chatCache);
    const text = bodyText(replied).trim() || previewFromMessage(replied) || "";
    if (!text) return null;
    return {
      sender_name: sender.name,
      sender_user_id: senderUserId(replied),
      text: text.slice(0, 200),
    };
  } catch {
    return null;
  }
}

function senderUserId(message: TdMessage): number | null {
  const sender = message.sender_id;
  if (sender?._ === "messageSenderUser" && typeof sender.user_id === "number") {
    return sender.user_id;
  }
  return null;
}

function senderChatId(message: TdMessage): number | null {
  const sender = message.sender_id;
  if (sender?._ === "messageSenderChat" && typeof sender.chat_id === "number") {
    return sender.chat_id;
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

async function resolveUserName(client: Client, userId: number, cache: Map<number, string>): Promise<string> {
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

async function resolveChatName(
  client: Client,
  chatId: number,
  cache: Map<number, { title: string; isChannel: boolean }>,
): Promise<{ title: string; isChannel: boolean }> {
  const cached = cache.get(chatId);
  if (cached) return cached;
  try {
    const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
    const title = chatTitle(chat);
    const kind = chatKindFromTdChat(chat);
    const resolved = { title, isChannel: kind === "channel" };
    cache.set(chatId, resolved);
    return resolved;
  } catch {
    return { title: "Channel", isChannel: true };
  }
}

async function resolveSenderName(
  client: Client,
  message: TdMessage,
  chat: TdChat,
  userCache: Map<number, string>,
  chatCache: Map<number, { title: string; isChannel: boolean }>,
): Promise<{ name: string; isChannel: boolean }> {
  const userId = senderUserId(message);
  if (userId != null) {
    return { name: await resolveUserName(client, userId, userCache), isChannel: false };
  }
  const senderChatIdValue = senderChatId(message);
  if (senderChatIdValue != null) {
    const resolved = await resolveChatName(client, senderChatIdValue, chatCache);
    return { name: resolved.title, isChannel: resolved.isChannel };
  }
  return { name: chatTitle(chat), isChannel: chatKindFromTdChat(chat) === "channel" };
}

export function effectiveReadOutboxMessageId(
  ...candidates: Array<number | null | undefined>
): number | null {
  let max: number | null = null;
  for (const raw of candidates) {
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0 && (max == null || id > max)) {
      max = id;
    }
  }
  return max;
}

export async function enrichOutgoingReadStatuses(
  client: Client,
  chat: TdChat,
  messages: MappedChatHistoryMessage[],
): Promise<MappedChatHistoryMessage[]> {
  if (chatKindFromTdChat(chat) !== "private") return messages;
  const pending = messages.filter(
    (row) => row.is_outgoing && row.outgoing_status === "delivered",
  );
  if (pending.length === 0) return messages;

  const readIds = new Set<number>();
  await Promise.all(
    pending.map(async (row) => {
      try {
        const full = (await client.invoke({
          _: "getMessage",
          chat_id: chat.id,
          message_id: row.telegram_message_id,
        })) as TdMessage;
        const readDate = full.interaction_info?.read_date;
        if (typeof readDate === "number" && readDate > 0) {
          readIds.add(row.telegram_message_id);
        }
      } catch {
        /* per-message read info unavailable */
      }
    }),
  );

  if (readIds.size === 0) return messages;
  return messages.map((row) =>
    readIds.has(row.telegram_message_id) ? { ...row, outgoing_status: "read" } : row,
  );
}

export { lastReadOutboxMessageIdFromChat };

function resolveOutgoingStatus(message: TdMessage, chat: TdChat): MessageOutgoingStatus | null {
  if (!message.is_outgoing) return null;

  const sendingState = message.sending_state?._;
  if (sendingState === "messageSendingStateFailed") return "failed";
  if (sendingState === "messageSendingStatePending") return "pending";

  const readDate = message.interaction_info?.read_date;
  if (typeof readDate === "number" && readDate > 0) {
    return "read";
  }

  const messageId = Number(message.id);
  const lastReadOutbox = Number(chat.last_read_outbox_message_id);
  if (
    Number.isFinite(messageId) &&
    messageId > 0 &&
    Number.isFinite(lastReadOutbox) &&
    lastReadOutbox > 0 &&
    messageId <= lastReadOutbox
  ) {
    return "read";
  }

  return "delivered";
}

/** Re-apply private-chat read cursor to mapped history rows. */
export function applyReadOutboxToHistoryMessages(
  messages: MappedChatHistoryMessage[],
  chat: TdChat,
): MappedChatHistoryMessage[] {
  const lastReadOutbox = lastReadOutboxMessageIdFromChat(chat);
  if (lastReadOutbox == null) return messages;
  return messages.map((row) => {
    if (!row.is_outgoing) return row;
    if (row.outgoing_status === "pending" || row.outgoing_status === "failed") return row;
    if (row.telegram_message_id <= lastReadOutbox) {
      return { ...row, outgoing_status: "read" };
    }
    if (row.outgoing_status === "read") return row;
    return { ...row, outgoing_status: "delivered" };
  });
}

export async function mapHistoryMessage(
  client: Client,
  message: TdMessage,
  chat: TdChat,
  userCache: Map<number, string>,
  chatCache: Map<number, { title: string; isChannel: boolean }>,
): Promise<MappedChatHistoryMessage | null> {
  const telegramMessageId = Number(message.id);
  if (!Number.isFinite(telegramMessageId)) return null;

  const isCall = isCallMessage(message);
  const text = bodyText(message).trim();
  const hasMedia = hasDisplayableMedia(message);
  if (!text && !hasMedia && !isCall) return null;

  const sender = await resolveSenderName(client, message, chat, userCache, chatCache);
  const senderChatIdValue = senderChatId(message);
  const replyTo = await resolveReplyPreview(client, message, userCache, chatCache);
  const dimensions = mediaDimensions(message);

  return {
    telegram_message_id: telegramMessageId,
    text,
    sent_at: messageSentAtIso(message),
    sender_name: sender.name,
    sender_user_id: senderUserId(message),
    sender_chat_id: senderChatIdValue,
    sender_is_channel: sender.isChannel,
    is_outgoing: Boolean(message.is_outgoing),
    outgoing_status: resolveOutgoingStatus(message, chat),
    content_kind: messageContentKind(message),
    has_media: hasMedia,
    media_width: dimensions.width,
    media_height: dimensions.height,
    reply_to: replyTo,
    ...(isCall ? { call_success: parseCallSuccess(message) } : {}),
  };
}
