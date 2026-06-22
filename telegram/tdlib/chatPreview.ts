import type { Client } from "tdl";

export type TdMessage = {
  id?: number;
  chat_id?: number;
  date?: number;
  is_outgoing?: boolean;
  sender_id?: { _?: string; user_id?: number; chat_id?: number };
  reply_to?: {
    _?: string;
    chat_id?: number;
    message_id?: number;
  };
  content?: Record<string, unknown>;
};

export type TdChat = {
  id: number;
  title?: string;
  type?: {
    _?: string;
    title?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
    user_id?: number;
  };
  last_message?: TdMessage;
  unread_count?: number;
  photo?: { small?: { id?: number } };
};

export type ChatPresenceKind = "online" | "recently" | "last_week" | "last_month" | "offline";

export type ChatPresence = {
  kind: ChatPresenceKind;
  at: string | null;
};

export function peerUserIdFromChat(chat: TdChat): number | null {
  if (chat.type?._ !== "chatTypePrivate") return null;
  const userId = chat.type.user_id;
  return typeof userId === "number" && Number.isFinite(userId) ? userId : null;
}

export function presenceFromTdlibStatus(status: unknown): ChatPresence | null {
  if (!status || typeof status !== "object") return null;
  const row = status as { _?: string; was_online?: number };
  switch (row._) {
    case "userStatusOnline":
      return { kind: "online", at: null };
    case "userStatusRecently":
      return { kind: "recently", at: null };
    case "userStatusLastWeek":
      return { kind: "last_week", at: null };
    case "userStatusLastMonth":
      return { kind: "last_month", at: null };
    case "userStatusOffline": {
      const was = row.was_online;
      const at =
        typeof was === "number" && was > 0 ? new Date(was * 1000).toISOString() : null;
      return { kind: "offline", at };
    }
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chatTitle(chat: TdChat): string {
  if (chat.title?.trim()) return chat.title.trim();
  const t = chat.type;
  if (t?._ === "chatTypePrivate") {
    const parts = [t.first_name, t.last_name].filter(Boolean);
    if (parts.length) return parts.join(" ");
    if (t.username) return `@${t.username}`;
  }
  if (t?._ === "chatTypeBasicGroup" || t?._ === "chatTypeSupergroup") {
    if (t.title?.trim()) return t.title.trim();
  }
  return `Chat ${chat.id}`;
}

export function formattedTextPlain(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { text?: string; _?: string };
  const text = obj.text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export function previewFromMessage(msg: TdMessage | undefined | null): string | null {
  const c = msg?.content;
  if (!c || typeof c !== "object") return null;
  const type = c._;
  if (typeof type !== "string") return null;

  if (type === "messageText") {
    const text = formattedTextPlain(c.text);
    return text ? text.slice(0, 240) : null;
  }

  if (type === "messageForwardedMessage") {
    const nested = c.message as TdMessage | undefined;
    const inner = previewFromMessage(nested);
    if (inner) return inner;
  }

  if (type === "messagePhoto" || type === "messageVideo" || type === "messageDocument") {
    const caption = formattedTextPlain(c.caption);
    if (caption) return caption.slice(0, 240);
  }

  if (type === "messagePhoto") return "Photo";
  if (type === "messageVideo") return "Video";
  if (type === "messageDocument") return "Document";
  if (type === "messageSticker") return "Sticker";
  if (type === "messageAnimation") return "GIF";
  if (type === "messageVoiceNote") return "Voice message";
  if (type === "messageVideoNote") return "Video message";
  if (type === "messageAudio") return "Audio";
  if (type === "messagePoll") return "Poll";
  if (type === "messageLocation") return "Location";
  if (type === "messageContact") return "Contact";
  if (type === "messageDice") return "Dice";
  if (type === "messageGame") return "Game";
  if (type === "messageInvoice") return "Invoice";
  if (type === "messageCall") return "Call";
  if (type === "messagePinnedMessage") return "Pinned message";
  if (type === "messageStory") return "Story";
  if (type === "messageGiveaway") return "Giveaway";
  if (type === "messageGiveawayWinners") return "Giveaway winners";
  if (type === "messageForumTopicCreated") return "Topic created";
  if (type === "messageForumTopicEdited") return "Topic updated";
  if (type === "messageChatChangePhoto") return "Chat photo updated";
  if (type === "messageChatChangeTitle") {
    const title = typeof c.title === "string" ? c.title.trim() : "";
    return title ? `Chat title: ${title}` : "Chat title updated";
  }
  if (type === "messageChatAddMembers") return "Members added";
  if (type === "messageChatDeleteMember") return "Member left";
  if (type === "messageChatJoinByLink") return "Joined via link";
  if (type === "messageChatUpgradeTo") return "Group upgraded";
  if (type.startsWith("message")) return "Message";
  return null;
}

/** Full text for chat body (no preview truncation on plain text messages). */
export function messageDisplayText(msg: TdMessage | undefined | null): string | null {
  const c = msg?.content;
  if (!c || typeof c !== "object") return null;
  if (c._ !== "messageText") return null;
  const text = formattedTextPlain(c.text);
  return text ?? null;
}

export function lastMessageAtIso(chat: TdChat, message?: TdMessage | null): string {
  const ts = message?.date ?? chat.last_message?.date;
  if (typeof ts === "number" && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function normalizeUnreadCount(chat: TdChat): number {
  const raw = Number(chat.unread_count);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // Guard corrupt values (e.g. message/chat ids mistaken for unread).
  if (raw > 50_000 || raw === chat.id || raw === Math.abs(chat.id)) return 0;
  return Math.floor(raw);
}

async function fetchLatestMessagePreview(client: Client, chatId: number): Promise<string | null> {
  try {
    try {
      await client.invoke({ _: "openChat", chat_id: chatId });
      await sleep(150);
    } catch {
      /* chat may already be open */
    }

    const history = (await client.invoke({
      _: "getChatHistory",
      chat_id: chatId,
      from_message_id: 0,
      offset: 0,
      limit: 1,
      only_local: false,
    })) as { messages?: TdMessage[] };

    const fromHistory = previewFromMessage(history.messages?.[0]);
    if (fromHistory) return fromHistory;

    const refreshed = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
    return previewFromMessage(refreshed.last_message);
  } catch {
    return null;
  }
}

export async function resolveLastMessagePreview(client: Client, chat: TdChat): Promise<string | null> {
  const direct = previewFromMessage(chat.last_message);
  if (direct) return direct;

  const messageId = chat.last_message?.id;
  if (typeof messageId === "number") {
    try {
      const full = (await client.invoke({
        _: "getMessage",
        chat_id: chat.id,
        message_id: messageId,
      })) as TdMessage;
      const fromMessage = previewFromMessage(full);
      if (fromMessage) return fromMessage;
    } catch {
      /* fall through */
    }
  }

  return fetchLatestMessagePreview(client, chat.id);
}
