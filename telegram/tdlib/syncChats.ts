import fs from "fs";
import type { Client } from "tdl";
import {
  clearDemoThreads,
  markTelegramMessagesConnected,
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

type TdChat = {
  id: number;
  title?: string;
  type?: { _?: string; title?: string; first_name?: string; last_name?: string; username?: string };
  last_message?: {
    date?: number;
    content?: { _?: string; text?: { text?: string } };
  };
  unread_count?: number;
  photo?: { small?: TdFile; big?: TdFile };
};

const AVATAR_DOWNLOAD_TIMEOUT_MS = 8_000;
const AVATAR_SYNC_CONCURRENCY = 4;

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

function lastMessageSubtitle(chat: TdChat): string | null {
  const msg = chat.last_message;
  if (!msg?.content) return null;
  const c = msg.content;
  if (c._ === "messageText" && c.text?.text) return c.text.text.slice(0, 240);
  if (c._ === "messagePhoto") return "Photo";
  if (c._ === "messageVideo") return "Video";
  if (c._ === "messageDocument") return "Document";
  if (c._ === "messageSticker") return "Sticker";
  if (c._ === "messageAnimation") return "GIF";
  if (c._ === "messageVoiceNote") return "Voice message";
  if (c._ === "messageVideoNote") return "Video message";
  if (c._ === "messageAudio") return "Audio";
  if (c._ === "messagePoll") return "Poll";
  if (c._ === "messageLocation") return "Location";
  if (c._ === "messageContact") return "Contact";
  return null;
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

async function resolveChatAvatarUrl(client: Client, chat: TdChat): Promise<string | null> {
  const fileId = chat.photo?.small?.id;
  if (typeof fileId !== "number") return null;

  try {
    let file = chat.photo?.small;
    if (!file?.local?.is_downloading_completed || !file.local.path) {
      await client.invoke({
        _: "downloadFile",
        file_id: fileId,
        priority: 16,
        offset: 0,
        limit: 0,
        synchronous: false,
      });
      file = (await waitForLocalFile(client, fileId)) ?? undefined;
    }
    const path = file?.local?.path;
    if (!path) return null;
    const buf = await fs.promises.readFile(path);
    if (buf.length === 0) return null;
    return `data:${mimeFromPath(path)};base64,${buf.toString("base64")}`;
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
  await upsertTelegramThread({
    telegramUsername,
    telegramChatId: chat.id,
    title: chatTitle(chat),
    subtitle: lastMessageSubtitle(chat),
    avatarUrl: null,
    lastMessageAt: lastMessageAtIso(chat),
    unreadCount: Number(chat.unread_count) || 0,
  });
}

export async function syncChatThreads(client: Client, telegramUsername: string): Promise<number> {
  const chats = await loadAllChats(client);
  await clearDemoThreads(telegramUsername);

  const avatarUrls = await mapWithConcurrency(chats, AVATAR_SYNC_CONCURRENCY, (chat) =>
    resolveChatAvatarUrl(client, chat),
  );

  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    await upsertTelegramThread({
      telegramUsername,
      telegramChatId: chat.id,
      title: chatTitle(chat),
      subtitle: lastMessageSubtitle(chat),
      avatarUrl: avatarUrls[i] ?? null,
      lastMessageAt: lastMessageAtIso(chat),
      unreadCount: Number(chat.unread_count) || 0,
    });
  }

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
