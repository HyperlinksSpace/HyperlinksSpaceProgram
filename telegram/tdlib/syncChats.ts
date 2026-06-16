import fs from "fs";
import type { Client } from "tdl";
import {
  clearDemoThreads,
  markTelegramMessagesConnected,
  pruneTelegramThreadsBefore,
  TELEGRAM_THREAD_NO_AVATAR,
  upsertTelegramThread,
} from "../../database/telegramMessages.js";
import { touchMtprotoSync, upsertMtprotoSession } from "../../database/telegramMtproto.js";
import { getTdlibUserDir } from "./env.js";

type TdFile = {
  id?: number;
  local?: {
    path?: string;
    is_downloading_completed?: boolean;
    is_downloading_active?: boolean;
  };
};

type TdMessage = {
  id?: number;
  date?: number;
  content?: Record<string, unknown>;
};

type TdChat = {
  id: number;
  title?: string;
  type?: { _?: string; title?: string; first_name?: string; last_name?: string; username?: string };
  last_message?: TdMessage;
  unread_count?: number;
  photo?: { small?: TdFile; big?: TdFile };
};

const AVATAR_DOWNLOAD_TIMEOUT_MS = 15_000;
const AVATAR_SYNC_CONCURRENCY = 3;
const PREVIEW_SYNC_CONCURRENCY = 6;

function chatTitle(chat: TdChat): string {
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

function formattedTextPlain(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as { text?: string }).text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function previewFromMessage(msg: TdMessage | undefined | null): string | null {
  const c = msg?.content;
  if (!c || typeof c !== "object") return null;
  const type = c._;
  if (typeof type !== "string") return null;

  if (type === "messageText") {
    const text = formattedTextPlain(c.text);
    return text ? text.slice(0, 240) : null;
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
  if (type.startsWith("message")) return "Message";
  return null;
}

async function fetchLatestMessagePreview(client: Client, chatId: number): Promise<string | null> {
  try {
    try {
      await client.invoke({ _: "openChat", chat_id: chatId });
      await sleep(120);
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
    return previewFromMessage(history.messages?.[0]);
  } catch {
    return null;
  }
}

async function resolveLastMessagePreview(client: Client, chat: TdChat): Promise<string | null> {
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

function lastMessageAtIso(chat: TdChat): string {
  const ts = chat.last_message?.date;
  if (typeof ts === "number" && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return new Date().toISOString();
}

async function loadAllChats(client: Client): Promise<TdChat[]> {
  const chatList = { _: "chatListMain" as const };
  const collected = new Map<number, TdChat>();

  for (let round = 0; round < 40; round++) {
    let list: { chat_ids?: number[] };
    try {
      list = (await client.invoke({
        _: "getChats",
        chat_list: chatList,
        limit: 100,
      })) as { chat_ids?: number[] };
    } catch {
      break;
    }

    const ids = list.chat_ids ?? [];
    if (ids.length === 0) {
      try {
        await client.invoke({ _: "loadChats", chat_list: chatList, limit: 100 });
      } catch {
        break;
      }
      await sleep(400);
      continue;
    }

    for (const chatId of ids) {
      if (collected.has(chatId)) continue;
      try {
        const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
        collected.set(chatId, chat);
      } catch {
        /* skip unreadable chat */
      }
    }

    if (ids.length < 100) break;
    const oldest = ids[ids.length - 1];
    try {
      await client.invoke({ _: "loadChats", chat_list: chatList, limit: 100, offset_chat_id: oldest });
    } catch {
      break;
    }
    await sleep(300);
  }

  return [...collected.values()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function waitForLocalFile(client: Client, fileId: number): Promise<TdFile | null> {
  const deadline = Date.now() + AVATAR_DOWNLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const file = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
      if (file.local?.is_downloading_completed && file.local.path) return file;
      if (file.local?.is_downloading_active === false && !file.local?.is_downloading_completed) {
        return null;
      }
    } catch {
      return null;
    }
    await sleep(150);
  }
  return null;
}

async function downloadChatAvatarBytes(
  client: Client,
  chat: TdChat,
): Promise<{ data: Buffer; mime: string } | typeof TELEGRAM_THREAD_NO_AVATAR | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let current = chat;
    if (attempt > 0) {
      try {
        current = (await client.invoke({ _: "getChat", chat_id: chat.id })) as TdChat;
        await sleep(250 * attempt);
      } catch {
        continue;
      }
    }

    const fileId = current.photo?.small?.id;
    if (typeof fileId !== "number") return TELEGRAM_THREAD_NO_AVATAR;

    try {
      let file = current.photo?.small;
      const useSync = attempt >= 1;
      if (!file?.local?.is_downloading_completed || !file.local.path) {
        await client.invoke({
          _: "downloadFile",
          file_id: fileId,
          priority: 16,
          offset: 0,
          limit: 0,
          synchronous: useSync,
        });
        if (!useSync) {
          file = (await waitForLocalFile(client, fileId)) ?? undefined;
        } else {
          file = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
        }
      }
      const filePath = file?.local?.path;
      if (!filePath) continue;
      const buf = await fs.promises.readFile(filePath);
      if (buf.length === 0) continue;
      return { data: buf, mime: mimeFromPath(filePath) };
    } catch {
      /* retry */
    }
  }
  return null;
}

async function resolveChatAvatarUrl(client: Client, chat: TdChat): Promise<string | null> {
  const result = await downloadChatAvatarBytes(client, chat);
  if (result === TELEGRAM_THREAD_NO_AVATAR) return TELEGRAM_THREAD_NO_AVATAR;
  if (!result) return null;
  return `data:${result.mime};base64,${result.data.toString("base64")}`;
}

export async function readChatAvatarBytes(
  client: Client,
  chatId: number,
): Promise<{ data: Buffer; mime: string } | typeof TELEGRAM_THREAD_NO_AVATAR | null> {
  try {
    const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
    return downloadChatAvatarBytes(client, chat);
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function persistMtprotoConnection(
  client: Client,
  telegramUsername: string,
): Promise<void> {
  let telegramUserId: number | null = null;
  try {
    const me = (await client.invoke({ _: "getMe" })) as { id?: number };
    if (typeof me.id === "number") telegramUserId = me.id;
  } catch {
    /* ignore */
  }

  const dbPath = getTdlibUserDir(telegramUsername);
  await upsertMtprotoSession({
    telegramUsername,
    telegramUserId,
    tdlibDbPath: dbPath,
    status: "active",
  });
  await markTelegramMessagesConnected(telegramUsername);
}

export async function refreshChatThreadFromTdlib(
  client: Client,
  telegramUsername: string,
  chatId: number,
): Promise<void> {
  const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const subtitle = await resolveLastMessagePreview(client, chat);
  const avatarUrl = await resolveChatAvatarUrl(client, chat);
  await upsertTelegramThread({
    telegramUsername,
    telegramChatId: chat.id,
    title: chatTitle(chat),
    subtitle,
    avatarUrl,
    lastMessageAt: lastMessageAtIso(chat),
    unreadCount: Number(chat.unread_count) || 0,
  });
}

export async function backfillChatThreads(
  client: Client,
  telegramUsername: string,
  chatIds: number[],
): Promise<number> {
  let refreshed = 0;
  for (const chatId of chatIds) {
    try {
      await refreshChatThreadFromTdlib(client, telegramUsername, chatId);
      refreshed += 1;
    } catch {
      /* skip unreadable chat */
    }
  }
  if (refreshed > 0) await touchMtprotoSync(telegramUsername);
  return refreshed;
}

async function enrichChatRow(
  client: Client,
  chat: TdChat,
  subtitle: string | null,
  avatarUrl: string | null,
): Promise<{ subtitle: string | null; avatarUrl: string | null }> {
  let nextSubtitle = subtitle;
  let nextAvatar = avatarUrl;
  if (!nextSubtitle) {
    nextSubtitle = await resolveLastMessagePreview(client, chat);
  }
  if (!nextAvatar) {
    nextAvatar = await resolveChatAvatarUrl(client, chat);
  }
  return { subtitle: nextSubtitle, avatarUrl: nextAvatar };
}

export async function syncChatThreads(client: Client, telegramUsername: string): Promise<number> {
  const syncStartedAt = new Date().toISOString();
  const chats = await loadAllChats(client);
  await clearDemoThreads(telegramUsername);

  let subtitles = await mapWithConcurrency(chats, PREVIEW_SYNC_CONCURRENCY, (chat) =>
    resolveLastMessagePreview(client, chat),
  );
  let avatarUrls = await mapWithConcurrency(chats, AVATAR_SYNC_CONCURRENCY, (chat) =>
    resolveChatAvatarUrl(client, chat),
  );

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < chats.length; i++) {
      if (subtitles[i] && avatarUrls[i]) continue;
      const enriched = await enrichChatRow(client, chats[i], subtitles[i] ?? null, avatarUrls[i] ?? null);
      subtitles[i] = enriched.subtitle;
      avatarUrls[i] = enriched.avatarUrl;
    }
  }

  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    await upsertTelegramThread({
      telegramUsername,
      telegramChatId: chat.id,
      title: chatTitle(chat),
      subtitle: subtitles[i] ?? null,
      avatarUrl: avatarUrls[i] ?? null,
      lastMessageAt: lastMessageAtIso(chat),
      unreadCount: Number(chat.unread_count) || 0,
    });
  }

  await pruneTelegramThreadsBefore(telegramUsername, syncStartedAt);
  await touchMtprotoSync(telegramUsername);
  return chats.length;
}

export async function syncChatsFromTdlib(
  client: Client,
  telegramUsername: string,
): Promise<number> {
  await persistMtprotoConnection(client, telegramUsername);
  return syncChatThreads(client, telegramUsername);
}
