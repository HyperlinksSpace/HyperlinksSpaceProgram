import type { FormattedTextSegment } from "../../shared/formattedTextSegments.js";
import type { Client } from "tdl";
import {
  chatTitle,
  formattedTextPlain,
  isGenericMessagePreviewLabel,
  lastReadOutboxMessageIdFromChat,
  messageBodyText,
  messageIsOutgoing,
  messageReadDateFromTdMessage,
  previewFromMessage,
  type TdChat,
  type TdMessage,
} from "./chatPreview.js";
import { messageTextSegments } from "./formattedTextSegments.js";
import { largestPhotoDimensions } from "./photoParse.js";

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
  text_segments?: FormattedTextSegment[] | null;
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
    text_segments?: FormattedTextSegment[] | null;
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
    return largestPhotoDimensions(row);
  }
  if (type === "messageVideo" || type === "messageAnimation") {
    const media = (row.video ?? row.animation) as { width?: number; height?: number } | undefined;
    const w = Number(media?.width);
    const h = Number(media?.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  if (type === "messageSticker") {
    const sticker = row.sticker as { width?: number; height?: number } | undefined;
    const w = Number(sticker?.width);
    const h = Number(sticker?.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  return { width: null, height: null };
}

function hasDisplayableMedia(message: TdMessage): boolean {
  const kind = messageContentKind(message);
  return kind === "photo" || kind === "video" || kind === "animation" || kind === "sticker";
}

function captionText(message: TdMessage): string | null {
  const c = message.content;
  if (!c || typeof c !== "object") return null;
  const caption = formattedTextPlain((c as { caption?: unknown }).caption);
  return caption ?? null;
}

function bodyText(message: TdMessage): string {
  return messageBodyText(message);
}

function messageNeedsFullFetch(message: TdMessage): boolean {
  const text = bodyText(message).trim();
  if (text && !isGenericMessagePreviewLabel(text)) return false;
  const content = message.content;
  if (!content || typeof content !== "object") return true;
  const type = content._;
  if (type === "messageText") {
    return !formattedTextPlain((content as { text?: unknown }).text);
  }
  if (typeof type === "string" && type.startsWith("message")) {
    return !text || isGenericMessagePreviewLabel(text);
  }
  return false;
}

async function resolveFullMessage(
  client: Client,
  message: TdMessage,
  chatId: number,
): Promise<TdMessage> {
  if (!messageNeedsFullFetch(message)) return message;
  const messageId = Number(message.id);
  if (!Number.isFinite(messageId) || messageId <= 0) return message;
  try {
    return (await client.invoke({
      _: "getMessage",
      chat_id: chatId,
      message_id: messageId,
    })) as TdMessage;
  } catch {
    return message;
  }
}

async function resolveReplyPreview(
  client: Client,
  message: TdMessage,
  userCache: Map<number, string>,
  chatCache: Map<number, { title: string; isChannel: boolean }>,
): Promise<{
  sender_name: string;
  sender_user_id: number | null;
  text: string;
  text_segments: FormattedTextSegment[] | null;
} | null> {
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
    const replySegments = messageTextSegments(replied);
    return {
      sender_name: sender.name,
      sender_user_id: senderUserId(replied),
      text: text.slice(0, 200),
      text_segments: replySegments,
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

  const readIds = new Set<number>();
  const lastReadOutbox = lastReadOutboxMessageIdFromChat(chat);
  if (lastReadOutbox != null) {
    for (const row of messages) {
      if (row.is_outgoing && row.telegram_message_id <= lastReadOutbox) {
        readIds.add(row.telegram_message_id);
      }
    }
  }

  const pending = messages.filter(
    (row) =>
      row.is_outgoing &&
      !readIds.has(row.telegram_message_id) &&
      row.outgoing_status !== "pending" &&
      row.outgoing_status !== "failed",
  );
  if (pending.length === 0 && readIds.size === 0) return messages;

  await Promise.all(
    pending.map(async (row) => {
      try {
        const readState = (await client.invoke({
          _: "getMessageReadDate",
          chat_id: chat.id,
          message_id: row.telegram_message_id,
        })) as { _?: string; date?: number };
        if (
          readState._ === "messageReadDateRead" &&
          typeof readState.date === "number" &&
          readState.date > 0
        ) {
          readIds.add(row.telegram_message_id);
          return;
        }
      } catch {
        /* fall through */
      }
      try {
        const full = (await client.invoke({
          _: "getMessage",
          chat_id: chat.id,
          message_id: row.telegram_message_id,
        })) as TdMessage;
        if (messageReadDateFromTdMessage(full) != null) {
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

function resolveOutgoingStatus(
  message: TdMessage,
  chat: TdChat,
  myUserId?: number | null,
): MessageOutgoingStatus | null {
  if (!messageIsOutgoing(message, myUserId)) return null;

  const sendingState = message.sending_state?._;
  if (sendingState === "messageSendingStateFailed") return "failed";
  if (sendingState === "messageSendingStatePending") return "pending";

  if (messageReadDateFromTdMessage(message) != null) {
    return "read";
  }

  const messageId = Number(message.id);
  const lastReadOutbox = lastReadOutboxMessageIdFromChat(chat);
  if (
    Number.isFinite(messageId) &&
    messageId > 0 &&
    lastReadOutbox != null &&
    messageId <= lastReadOutbox
  ) {
    return "read";
  }

  return "delivered";
}

/** In private chats, any read outgoing message implies all older outgoing are read. */
export function applyCumulativeOutgoingReadStatuses(
  messages: MappedChatHistoryMessage[],
): MappedChatHistoryMessage[] {
  let maxReadId: number | null = null;
  for (const row of messages) {
    if (!row.is_outgoing || row.outgoing_status !== "read") continue;
    const id = row.telegram_message_id;
    if (maxReadId == null || id > maxReadId) maxReadId = id;
  }
  if (maxReadId == null) return messages;
  return messages.map((row) => {
    if (!row.is_outgoing) return row;
    if (row.outgoing_status === "pending" || row.outgoing_status === "failed") return row;
    if (row.telegram_message_id <= maxReadId!) {
      return { ...row, outgoing_status: "read" };
    }
    return row;
  });
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
  myUserId?: number | null,
): Promise<MappedChatHistoryMessage | null> {
  const resolved = await resolveFullMessage(client, message, chat.id);
  const telegramMessageId = Number(resolved.id);
  if (!Number.isFinite(telegramMessageId)) return null;

  const isCall = isCallMessage(resolved);
  const text = bodyText(resolved).trim();
  const hasMedia = hasDisplayableMedia(resolved);
  if (!text && !hasMedia && !isCall) return null;

  const sender = await resolveSenderName(client, resolved, chat, userCache, chatCache);
  const senderChatIdValue = senderChatId(resolved);
  const replyTo = await resolveReplyPreview(client, resolved, userCache, chatCache);
  const dimensions = mediaDimensions(resolved);

  const textSegments = messageTextSegments(resolved);

  return {
    telegram_message_id: telegramMessageId,
    text,
    ...(textSegments ? { text_segments: textSegments } : {}),
    sent_at: messageSentAtIso(resolved),
    sender_name: sender.name,
    sender_user_id: senderUserId(resolved),
    sender_chat_id: senderChatIdValue,
    sender_is_channel: sender.isChannel,
    is_outgoing: messageIsOutgoing(resolved, myUserId),
    outgoing_status: resolveOutgoingStatus(resolved, chat, myUserId),
    content_kind: messageContentKind(resolved),
    has_media: hasMedia,
    media_width: dimensions.width,
    media_height: dimensions.height,
    reply_to: replyTo,
    ...(isCall ? { call_success: parseCallSuccess(resolved) } : {}),
  };
}
