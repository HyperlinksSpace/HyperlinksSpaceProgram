import fs from "fs";
import type { Client } from "tdl";
import { markTelegramMessagesConnected } from "../../database/telegramMessages.js";
import { touchMtprotoSync, upsertMtprotoSession } from "../../database/telegramMtproto.js";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../shared/telegramThreadConstants.js";
import { getTdlibUserDir } from "./env.js";
import {
  chatTitle,
  lastMessageAtIso,
  normalizeUnreadCount,
  peerUserIdFromChat,
  presenceFromTdlibStatus,
  resolveLastMessagePreview,
  type TdChat,
} from "./chatPreview.js";
import { patchLiveChatFromTdlib, seedLiveChatList, type LiveChatRow } from "./liveChatCache.js";

type TdFile = {
  id?: number;
  local?: {
    path?: string;
    is_downloading_completed?: boolean;
    is_downloading_active?: boolean;
  };
};

const AVATAR_DOWNLOAD_TIMEOUT_MS = 15_000;
const AVATAR_SYNC_CONCURRENCY = 3;
const PREVIEW_SYNC_CONCURRENCY = 8;
const PRESENCE_SYNC_CONCURRENCY = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      let file = current.photo?.small as TdFile | undefined;
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

type TdUserProfile = {
  profile_photo?: { small?: { id?: number } };
};

export async function readUserAvatarBytes(
  client: Client,
  userId: number,
): Promise<{ data: Buffer; mime: string } | typeof TELEGRAM_THREAD_NO_AVATAR | null> {
  try {
    const user = (await client.invoke({ _: "getUser", user_id: userId })) as TdUserProfile;
    const fileId = user.profile_photo?.small?.id;
    if (typeof fileId !== "number") return TELEGRAM_THREAD_NO_AVATAR;
    let file = user.profile_photo?.small as TdFile | undefined;
    if (!file?.local?.is_downloading_completed || !file.local.path) {
      await client.invoke({
        _: "downloadFile",
        file_id: fileId,
        priority: 16,
        offset: 0,
        limit: 0,
        synchronous: true,
      });
      file = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
    }
    const filePath = file?.local?.path;
    if (!filePath) return null;
    const buf = await fs.promises.readFile(filePath);
    if (buf.length === 0) return null;
    return { data: buf, mime: mimeFromPath(filePath) };
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

export async function refreshLiveChatFromTdlib(
  client: Client,
  telegramUsername: string,
  chatId: number,
): Promise<void> {
  const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const subtitle = await resolveLastMessagePreview(client, chat);
  const avatarUrl = await resolveChatAvatarUrl(client, chat);
  patchLiveChatFromTdlib(telegramUsername, chat, {
    subtitle,
    avatar_url: avatarUrl,
    last_message: chat.last_message ?? null,
  });
}

export async function refreshLiveChats(
  client: Client,
  telegramUsername: string,
  chatIds: number[],
): Promise<number> {
  let refreshed = 0;
  for (const chatId of chatIds) {
    try {
      await refreshLiveChatFromTdlib(client, telegramUsername, chatId);
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

async function resolveChatPresence(
  client: Client,
  chat: TdChat,
): Promise<{ kind: LiveChatRow["presence_kind"]; at: string | null } | null> {
  const peerUserId = peerUserIdFromChat(chat);
  if (peerUserId == null) return null;
  try {
    const user = (await client.invoke({ _: "getUser", user_id: peerUserId })) as {
      status?: unknown;
    };
    return presenceFromTdlibStatus(user.status);
  } catch {
    return null;
  }
}

export async function syncChatThreads(client: Client, telegramUsername: string): Promise<number> {
  const chats = await loadAllChats(client);

  let subtitles = await mapWithConcurrency(chats, PREVIEW_SYNC_CONCURRENCY, (chat) =>
    resolveLastMessagePreview(client, chat),
  );
  let avatarUrls = await mapWithConcurrency(chats, AVATAR_SYNC_CONCURRENCY, (chat) =>
    resolveChatAvatarUrl(client, chat),
  );
  let presences = await mapWithConcurrency(chats, PRESENCE_SYNC_CONCURRENCY, (chat) =>
    resolveChatPresence(client, chat),
  );

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < chats.length; i++) {
      if (subtitles[i] && avatarUrls[i]) continue;
      const enriched = await enrichChatRow(client, chats[i], subtitles[i] ?? null, avatarUrls[i] ?? null);
      subtitles[i] = enriched.subtitle;
      avatarUrls[i] = enriched.avatarUrl;
    }
  }

  const liveRows: Omit<LiveChatRow, "revision">[] = [];
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    const presence = presences[i];
    liveRows.push({
      telegram_chat_id: chat.id,
      title: chatTitle(chat),
      subtitle: subtitles[i] ?? "",
      avatar_url: avatarUrls[i] ?? null,
      last_message_at: lastMessageAtIso(chat),
      unread_count: normalizeUnreadCount(chat),
      peer_user_id: peerUserIdFromChat(chat),
      presence_kind: presence?.kind ?? null,
      presence_at: presence?.at ?? null,
    });
  }

  seedLiveChatList(telegramUsername, liveRows);
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
