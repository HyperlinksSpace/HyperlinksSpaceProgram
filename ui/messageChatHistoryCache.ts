import type { ChatHistoryPageResult } from "./telegram/fetchTelegramChatHistoryPage";

export type CachedChatHistoryPage = ChatHistoryPageResult & {
  fetchedAt: number;
};

const cache = new Map<number, CachedChatHistoryPage>();
const MAX_ENTRIES = 32;
const FRESH_MS = 45_000;
const MAX_AGE_MS = 10 * 60_000;
const SESSION_STORAGE_KEY = "hyperlinks_chat_history_cache_v1";

const cacheListeners = new Set<(chatId: number) => void>();

function emitCacheUpdate(chatId: number): void {
  for (const listener of cacheListeners) {
    listener(chatId);
  }
}

function readSessionCache(): Record<string, CachedChatHistoryPage> {
  try {
    if (typeof globalThis === "undefined" || !("sessionStorage" in globalThis)) {
      return {};
    }
    const raw = (globalThis as unknown as { sessionStorage: Storage }).sessionStorage.getItem(
      SESSION_STORAGE_KEY,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, CachedChatHistoryPage>;
  } catch {
    return {};
  }
}

function writeSessionCache(chatId: number, entry: CachedChatHistoryPage): void {
  try {
    if (typeof globalThis === "undefined" || !("sessionStorage" in globalThis)) return;
    const store = readSessionCache();
    store[String(chatId)] = entry;
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort(
        (a, b) => (store[a]!.fetchedAt ?? 0) - (store[b]!.fetchedAt ?? 0),
      );
      for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
        delete store[sorted[i]!];
      }
    }
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(store),
    );
  } catch {
    /* quota / private mode */
  }
}

function hydrateFromSession(chatId: number): CachedChatHistoryPage | null {
  const entry = readSessionCache()[String(chatId)];
  if (!entry || !Array.isArray(entry.messages) || entry.messages.length === 0) return null;
  if (Date.now() - entry.fetchedAt > MAX_AGE_MS) return null;
  cache.set(chatId, entry);
  return entry;
}

export function subscribeChatHistoryCache(listener: (chatId: number) => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

/** Restore the last cached first page for a chat (e.g. on reload with an open thread). */
export function warmChatHistoryCacheFromSession(chatId: number): boolean {
  if (!Number.isFinite(chatId)) return false;
  if (cache.has(chatId)) return true;
  return hydrateFromSession(chatId) != null;
}

function trimCache(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  const removeCount = cache.size - MAX_ENTRIES;
  for (let i = 0; i < removeCount; i++) {
    cache.delete(entries[i]![0]);
  }
}

export function getCachedChatHistory(chatId: number): CachedChatHistoryPage | null {
  let entry = cache.get(chatId) ?? null;
  if (!entry) {
    entry = hydrateFromSession(chatId);
  }
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MAX_AGE_MS) {
    cache.delete(chatId);
    return null;
  }
  return entry;
}

export function isChatHistoryCacheFresh(chatId: number, maxAgeMs = FRESH_MS): boolean {
  const entry = cache.get(chatId);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < maxAgeMs;
}

export function setCachedChatHistory(chatId: number, page: ChatHistoryPageResult): void {
  if (page.error) return;
  const entry = { ...page, fetchedAt: Date.now() };
  cache.set(chatId, entry);
  writeSessionCache(chatId, entry);
  trimCache();
  emitCacheUpdate(chatId);
}

export function invalidateChatHistoryCache(chatId: number): void {
  cache.delete(chatId);
}
