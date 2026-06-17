import {
  chatTitle,
  lastMessageAtIso,
  normalizeUnreadCount,
  previewFromMessage,
  type TdChat,
  type TdMessage,
} from "./chatPreview.js";

export type LiveChatRow = {
  telegram_chat_id: number;
  title: string;
  subtitle: string;
  avatar_url: string | null;
  last_message_at: string;
  unread_count: number;
  /** Monotonic version bumped on each update (for client diffing). */
  revision: number;
};

type UserCache = {
  chats: Map<number, LiveChatRow>;
  revision: number;
};

const caches = new Map<string, UserCache>();

function userCache(telegramUsername: string): UserCache {
  let cache = caches.get(telegramUsername);
  if (!cache) {
    cache = { chats: new Map(), revision: 0 };
    caches.set(telegramUsername, cache);
  }
  return cache;
}

function bumpRevision(cache: UserCache): number {
  cache.revision += 1;
  return cache.revision;
}

export function clearLiveChatCache(telegramUsername: string): void {
  caches.delete(telegramUsername);
}

export function getLiveChatListRevision(telegramUsername: string): number {
  return caches.get(telegramUsername)?.revision ?? 0;
}

export function getLiveChatList(telegramUsername: string): LiveChatRow[] | null {
  const cache = caches.get(telegramUsername);
  if (!cache || cache.chats.size === 0) return null;
  return [...cache.chats.values()].sort(
    (a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at),
  );
}

export function seedLiveChatList(
  telegramUsername: string,
  rows: Omit<LiveChatRow, "revision">[],
): void {
  const cache = userCache(telegramUsername);
  cache.chats.clear();
  const rev = bumpRevision(cache);
  for (const row of rows) {
    cache.chats.set(row.telegram_chat_id, { ...row, revision: rev });
  }
}

export function upsertLiveChatRow(
  telegramUsername: string,
  row: Omit<LiveChatRow, "revision">,
): LiveChatRow {
  const cache = userCache(telegramUsername);
  const rev = bumpRevision(cache);
  const next: LiveChatRow = { ...row, revision: rev };
  cache.chats.set(row.telegram_chat_id, next);
  return next;
}

export function patchLiveChatFromTdlib(
  telegramUsername: string,
  chat: TdChat,
  input: {
    subtitle?: string | null;
    avatar_url?: string | null;
    last_message?: TdMessage | null;
  },
): LiveChatRow {
  const cache = userCache(telegramUsername);
  const existing = cache.chats.get(chat.id);
  const subtitle =
    input.subtitle?.trim() ||
    previewFromMessage(input.last_message ?? chat.last_message) ||
    existing?.subtitle ||
    "";
  const row: Omit<LiveChatRow, "revision"> = {
    telegram_chat_id: chat.id,
    title: chatTitle(chat),
    subtitle,
    avatar_url: input.avatar_url !== undefined ? input.avatar_url : (existing?.avatar_url ?? null),
    last_message_at: lastMessageAtIso(chat, input.last_message ?? chat.last_message),
    unread_count: normalizeUnreadCount(chat),
  };
  return upsertLiveChatRow(telegramUsername, row);
}

export function applyLiveMessageUpdate(
  telegramUsername: string,
  chatId: number,
  message: TdMessage,
  unreadCount?: number,
): LiveChatRow | null {
  const cache = userCache(telegramUsername);
  const existing = cache.chats.get(chatId);
  const preview = previewFromMessage(message);
  if (!preview && !existing) return null;

  const row: Omit<LiveChatRow, "revision"> = {
    telegram_chat_id: chatId,
    title: existing?.title ?? `Chat ${chatId}`,
    subtitle: preview || existing?.subtitle || "",
    avatar_url: existing?.avatar_url ?? null,
    last_message_at: lastMessageAtIso({ id: chatId, last_message: message }, message),
    unread_count:
      typeof unreadCount === "number" && unreadCount >= 0
        ? unreadCount
        : (existing?.unread_count ?? 0),
  };
  return upsertLiveChatRow(telegramUsername, row);
}
