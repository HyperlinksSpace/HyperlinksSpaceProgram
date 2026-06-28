import { useSyncExternalStore } from "react";
import type { MessageChatRowData } from "./components/messages/MessageChatRow";

const STORAGE_KEY = "hyperlinks_authenticated_home_selected_chat_v1";

export type AuthenticatedHomeHistoryLoadTarget = {
  chatId: number | null;
  generation: number;
};

const HISTORY_LOAD_SNAPSHOT_IDLE: AuthenticatedHomeHistoryLoadTarget = {
  chatId: null,
  generation: 0,
};

function readStoredChat(): MessageChatRowData | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const row = parsed as Record<string, unknown>;
      const telegramChatId = Number(row.telegram_chat_id);
      if (!Number.isFinite(telegramChatId)) return null;
      return {
        id: Number(row.id) || 0,
        telegram_chat_id: telegramChatId,
        title: typeof row.title === "string" ? row.title : "",
        subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
        last_message_at:
          typeof row.last_message_at === "string" || typeof row.last_message_at === "number"
            ? String(row.last_message_at)
            : null,
        unread_count: Number.isFinite(Number(row.unread_count)) ? Number(row.unread_count) : 0,
        peer_user_id: Number.isFinite(Number(row.peer_user_id)) ? Number(row.peer_user_id) : null,
        presence_kind:
          row.presence_kind === "online" ||
          row.presence_kind === "recently" ||
          row.presence_kind === "last_week" ||
          row.presence_kind === "last_month" ||
          row.presence_kind === "offline"
            ? row.presence_kind
            : null,
        presence_at:
          typeof row.presence_at === "string" || typeof row.presence_at === "number"
            ? String(row.presence_at)
            : null,
        chat_action:
          row.chat_action === "typing" ||
          row.chat_action === "recording_voice" ||
          row.chat_action === "recording_video" ||
          row.chat_action === "uploading_photo" ||
          row.chat_action === "uploading_video" ||
          row.chat_action === "uploading_file"
            ? row.chat_action
            : null,
        chat_action_user_id: Number.isFinite(Number(row.chat_action_user_id))
          ? Number(row.chat_action_user_id)
          : null,
        chat_action_user_name:
          typeof row.chat_action_user_name === "string" ? row.chat_action_user_name : null,
        chat_action_expires_at:
          typeof row.chat_action_expires_at === "string" ||
          typeof row.chat_action_expires_at === "number"
            ? String(row.chat_action_expires_at)
            : null,
        last_read_outbox_message_id: (() => {
          const raw = Number(row.last_read_outbox_message_id);
          return Number.isFinite(raw) && raw > 0 ? raw : null;
        })(),
      };
    }
  } catch {
    /* private mode / SSR / corrupt storage */
  }
  return null;
}

function writeStoredChat(chat: MessageChatRowData | null): void {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
      if (chat == null) ls.removeItem(STORAGE_KEY);
      else ls.setItem(STORAGE_KEY, JSON.stringify(chat));
    }
  } catch {
    /* ignore */
  }
}

let selectedChat: MessageChatRowData | null = null;
/** Persisted: restore the opened chat and resume its history on reload. */
let historyLoadChatId: number | null = null;
let historyLoadGeneration = 0;
let historyLoadSnapshot: AuthenticatedHomeHistoryLoadTarget = HISTORY_LOAD_SNAPSHOT_IDLE;
let hydratedFromStorage = false;
const listeners = new Set<() => void>();

function syncHistoryLoadSnapshot(): AuthenticatedHomeHistoryLoadTarget {
  const chatId = historyLoadChatId;
  const generation = historyLoadGeneration;
  if (
    historyLoadSnapshot.chatId !== chatId ||
    historyLoadSnapshot.generation !== generation
  ) {
    historyLoadSnapshot = { chatId, generation };
  }
  return historyLoadSnapshot;
}

function hydrateFromStorageIfNeeded() {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  selectedChat = readStoredChat();
  if (selectedChat && historyLoadGeneration === 0) {
    historyLoadChatId = selectedChat.telegram_chat_id;
    historyLoadGeneration = 1;
    syncHistoryLoadSnapshot();
  }
}

function emit() {
  for (const l of listeners) {
    l();
  }
}

export function selectAuthenticatedHomeChat(chat: MessageChatRowData | null) {
  hydrateFromStorageIfNeeded();
  if (chat == null) {
    historyLoadChatId = null;
    syncHistoryLoadSnapshot();
    selectedChat = null;
    writeStoredChat(null);
    emit();
    return;
  }
  if (
    selectedChat?.telegram_chat_id === chat.telegram_chat_id &&
    selectedChat.title === chat.title &&
    selectedChat.subtitle === chat.subtitle &&
    selectedChat.last_message_at === chat.last_message_at &&
    selectedChat.presence_kind === chat.presence_kind &&
    selectedChat.presence_at === chat.presence_at &&
    selectedChat.chat_action === chat.chat_action &&
    selectedChat.chat_action_user_id === chat.chat_action_user_id &&
    selectedChat.chat_action_user_name === chat.chat_action_user_name &&
    selectedChat.chat_action_expires_at === chat.chat_action_expires_at &&
    selectedChat.last_read_outbox_message_id === chat.last_read_outbox_message_id
  ) {
    return;
  }
  selectedChat = chat;
  writeStoredChat(chat);
  emit();
}

/** Select chat and start (or restart) paginated history load for that chat. */
export function openAuthenticatedHomeChatHistory(chat: MessageChatRowData) {
  hydrateFromStorageIfNeeded();
  selectedChat = chat;
  writeStoredChat(chat);
  historyLoadChatId = chat.telegram_chat_id;
  historyLoadGeneration += 1;
  syncHistoryLoadSnapshot();
  emit();
}

export function clearAuthenticatedHomeSelectedChat() {
  historyLoadChatId = null;
  selectAuthenticatedHomeChat(null);
}

function getSnapshot() {
  hydrateFromStorageIfNeeded();
  return selectedChat;
}

function getServerSnapshot() {
  return null as MessageChatRowData | null;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useAuthenticatedHomeSelectedChat(): MessageChatRowData | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function getHistoryLoadSnapshot(): AuthenticatedHomeHistoryLoadTarget {
  hydrateFromStorageIfNeeded();
  return syncHistoryLoadSnapshot();
}

function getHistoryLoadServerSnapshot(): AuthenticatedHomeHistoryLoadTarget {
  return HISTORY_LOAD_SNAPSHOT_IDLE;
}

/** Resumes from storage on reload and increments on explicit chat clicks. */
export function useAuthenticatedHomeHistoryLoadTarget(): AuthenticatedHomeHistoryLoadTarget {
  return useSyncExternalStore(
    subscribe,
    getHistoryLoadSnapshot,
    getHistoryLoadServerSnapshot,
  );
}

/** Refresh stored selection when poll updates the same chat row. */
export function syncAuthenticatedHomeSelectedChat(chats: readonly MessageChatRowData[]) {
  hydrateFromStorageIfNeeded();
  if (selectedChat == null) return;
  const fresh = chats.find((c) => c.telegram_chat_id === selectedChat!.telegram_chat_id);
  if (!fresh) {
    selectAuthenticatedHomeChat(null);
    return;
  }
  if (
    fresh.title !== selectedChat.title ||
    fresh.subtitle !== selectedChat.subtitle ||
    fresh.last_message_at !== selectedChat.last_message_at ||
    fresh.unread_count !== selectedChat.unread_count ||
    fresh.avatar_url !== selectedChat.avatar_url ||
    fresh.presence_kind !== selectedChat.presence_kind ||
    fresh.presence_at !== selectedChat.presence_at ||
    fresh.chat_action !== selectedChat.chat_action ||
    fresh.chat_action_user_id !== selectedChat.chat_action_user_id ||
    fresh.chat_action_user_name !== selectedChat.chat_action_user_name ||
    fresh.chat_action_expires_at !== selectedChat.chat_action_expires_at ||
    fresh.last_read_outbox_message_id !== selectedChat.last_read_outbox_message_id
  ) {
    selectedChat = fresh;
    writeStoredChat(fresh);
    emit();
  }
}
