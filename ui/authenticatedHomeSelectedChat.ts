import { useSyncExternalStore } from "react";
import type { MessageChatRowData } from "./components/messages/MessageChatRow";

const STORAGE_KEY = "hyperlinks_authenticated_home_selected_chat_v1";

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
let hydratedFromStorage = false;
const listeners = new Set<() => void>();

function hydrateFromStorageIfNeeded() {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  selectedChat = readStoredChat();
}

function emit() {
  for (const l of listeners) {
    l();
  }
}

export function selectAuthenticatedHomeChat(chat: MessageChatRowData | null) {
  hydrateFromStorageIfNeeded();
  if (
    chat != null &&
    selectedChat?.telegram_chat_id === chat.telegram_chat_id &&
    selectedChat.title === chat.title &&
    selectedChat.subtitle === chat.subtitle &&
    selectedChat.last_message_at === chat.last_message_at
  ) {
    return;
  }
  selectedChat = chat;
  writeStoredChat(chat);
  emit();
}

export function clearAuthenticatedHomeSelectedChat() {
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
    fresh.avatar_url !== selectedChat.avatar_url
  ) {
    selectedChat = fresh;
    writeStoredChat(fresh);
    emit();
  }
}
