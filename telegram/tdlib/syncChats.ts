import type { Client } from "tdl";
import {
  clearDemoThreads,
  markTelegramMessagesConnected,
  upsertTelegramThread,
} from "../../database/telegramMessages.js";
import { touchMtprotoSync, upsertMtprotoSession } from "../../database/telegramMtproto.js";
import { getTdlibUserDir } from "./env.js";

type TdChat = {
  id: number;
  title?: string;
  type?: { _?: string; title?: string; first_name?: string; last_name?: string; username?: string };
  last_message?: {
    date?: number;
    content?: { _?: string; text?: { text?: string } };
  };
  unread_count?: number;
  photo?: { small?: { local?: { path?: string } } };
};

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

export async function syncChatThreads(client: Client, telegramUsername: string): Promise<number> {
  const chats = await loadAllChats(client);
  await clearDemoThreads(telegramUsername);

  for (const chat of chats) {
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
