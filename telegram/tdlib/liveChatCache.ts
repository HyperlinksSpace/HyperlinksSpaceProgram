import {
  chatTitle,
  lastMessageAtIso,
  normalizeUnreadCount,
  peerUserIdFromChat,
  previewFromMessage,
  type ChatPresenceKind,
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
  peer_user_id: number | null;
  presence_kind: ChatPresenceKind | null;
  presence_at: string | null;
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
    peer_user_id: existing?.peer_user_id ?? peerUserIdFromChat(chat),
    presence_kind: existing?.presence_kind ?? null,
    presence_at: existing?.presence_at ?? null,
  };
  return upsertLiveChatRow(telegramUsername, row);
}

export function patchLiveChatPresence(
  telegramUsername: string,
  peerUserId: number,
  presence: { kind: ChatPresenceKind; at: string | null },
): LiveChatRow | null {
  const cache = caches.get(telegramUsername);
  if (!cache) return null;
  for (const row of cache.chats.values()) {
    if (row.peer_user_id !== peerUserId) continue;
    return upsertLiveChatRow(telegramUsername, {
      telegram_chat_id: row.telegram_chat_id,
      title: row.title,
      subtitle: row.subtitle,
      avatar_url: row.avatar_url,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count,
      peer_user_id: row.peer_user_id,
      presence_kind: presence.kind,
      presence_at: presence.at,
    });
  }
  return null;
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
    peer_user_id: existing?.peer_user_id ?? null,
    presence_kind: existing?.presence_kind ?? null,
    presence_at: existing?.presence_at ?? null,
  };
  return upsertLiveChatRow(telegramUsername, row);
}
