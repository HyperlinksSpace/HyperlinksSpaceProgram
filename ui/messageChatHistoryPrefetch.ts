import type { MessageChatRowData } from "./components/messages/MessageChatRow";
import {
  MESSAGE_CHAT_HISTORY_PAGE_SIZE,
  MESSAGE_CHAT_HISTORY_PREVIEW_SIZE,
} from "./components/messages/messageChatLayout";
import {
  getCachedChatHistory,
  isChatHistoryCacheFresh,
  setCachedChatHistory,
} from "./messageChatHistoryCache";
import { logPageDisplay } from "./pageDisplayLog";
import { loadTelegramChatHistoryFirstPage } from "./telegram/fetchTelegramChatHistoryPage";

/** Max visible chats we warm in the background (viewport-driven). */
const PREFETCH_VISIBLE_MAX = 7;
const MAX_CONCURRENT = 2;

const inFlight = new Map<number, Promise<void>>();
const queued: Array<{
  chatId: number;
  peerUserId: number | null;
  priority: boolean;
  limit: number;
  previewOnly: boolean;
}> = [];
let activeCount = 0;

async function prefetchChatHistoryNow(
  chatId: number,
  peerUserId: number | null,
  options: { warmup?: boolean; limit: number; previewOnly: boolean },
): Promise<void> {
  const started = Date.now();
  const result = await loadTelegramChatHistoryFirstPage(chatId, peerUserId, {
    warmup: options.warmup !== false,
    limit: options.limit,
  });
  if (!result.error && result.messages.length > 0) {
    setCachedChatHistory(chatId, result, { previewOnly: options.previewOnly });
    logPageDisplay("messages_history_prefetch_ok", {
      chatId,
      count: result.messages.length,
      elapsedMs: Date.now() - started,
      priority: options.warmup === true,
      previewOnly: options.previewOnly,
      limit: options.limit,
    });
    return;
  }
  if (result.error) {
    logPageDisplay("messages_history_prefetch_skip", {
      chatId,
      error: result.error,
      elapsedMs: Date.now() - started,
      priority: options.warmup === true,
      previewOnly: options.previewOnly,
      limit: options.limit,
    });
  }
}

function scheduleDrain(): void {
  while (activeCount < MAX_CONCURRENT && queued.length > 0) {
    const next = queued.shift();
    if (!next) break;
    if (isChatHistoryCacheFresh(next.chatId) || inFlight.has(next.chatId)) continue;
    activeCount += 1;
    const promise = prefetchChatHistoryNow(next.chatId, next.peerUserId, {
      warmup: next.priority,
      limit: next.limit,
      previewOnly: next.previewOnly,
    }).finally(() => {
      activeCount -= 1;
      inFlight.delete(next.chatId);
      scheduleDrain();
    });
    inFlight.set(next.chatId, promise);
  }
}

function enqueuePrefetch(
  chatId: number,
  peerUserId: number | null | undefined,
  options: { priority?: boolean; limit: number; previewOnly: boolean },
): void {
  if (!Number.isFinite(chatId)) return;
  if (isChatHistoryCacheFresh(chatId) || inFlight.has(chatId)) return;

  const priority = options.priority === true;
  const existingIdx = queued.findIndex((row) => row.chatId === chatId);
  if (existingIdx >= 0) {
    if (priority) {
      const [row] = queued.splice(existingIdx, 1);
      if (row) {
        queued.unshift({
          ...row,
          priority: true,
          limit: options.limit,
          previewOnly: options.previewOnly,
        });
      }
      scheduleDrain();
    }
    return;
  }

  if (!priority && queued.length + inFlight.size >= PREFETCH_VISIBLE_MAX) return;

  const row = {
    chatId,
    peerUserId: Number.isFinite(Number(peerUserId)) ? Number(peerUserId) : null,
    priority,
    limit: options.limit,
    previewOnly: options.previewOnly,
  };
  if (priority) queued.unshift(row);
  else queued.push(row);
  scheduleDrain();
}

/** Prefetch a short preview page when a list row scrolls into view. */
export function prefetchChatHistory(
  chat: Pick<MessageChatRowData, "telegram_chat_id" | "peer_user_id">,
): void {
  enqueuePrefetch(chat.telegram_chat_id, chat.peer_user_id ?? null, {
    limit: MESSAGE_CHAT_HISTORY_PREVIEW_SIZE,
    previewOnly: true,
  });
}

/** High-priority prefetch for the open chat — full page, warms the gateway. */
export function prefetchChatHistoryPriority(
  chat: Pick<MessageChatRowData, "telegram_chat_id" | "peer_user_id">,
): void {
  const chatId = chat.telegram_chat_id;
  if (!Number.isFinite(chatId)) return;
  const cached = getCachedChatHistory(chatId);
  if (cached && !cached.previewOnly && isChatHistoryCacheFresh(chatId)) return;

  if (inFlight.has(chatId)) return;

  const existingIdx = queued.findIndex((row) => row.chatId === chatId);
  if (existingIdx >= 0) queued.splice(existingIdx, 1);

  activeCount += 1;
  const promise = prefetchChatHistoryNow(chatId, chat.peer_user_id ?? null, {
    warmup: true,
    limit: MESSAGE_CHAT_HISTORY_PAGE_SIZE,
    previewOnly: false,
  }).finally(() => {
    activeCount -= 1;
    inFlight.delete(chatId);
    scheduleDrain();
  });
  inFlight.set(chatId, promise);
}

/** @deprecated Use viewport-driven {@link prefetchChatHistory} from visible rows. */
export function prefetchChatHistoryForList(
  chats: readonly MessageChatRowData[],
  options?: { skipChatId?: number | null },
): void {
  if (chats.length === 0) return;
  const skipId = options?.skipChatId ?? null;
  for (const chat of chats) {
    if (skipId != null && chat.telegram_chat_id === skipId) continue;
    if (queued.length + inFlight.size >= PREFETCH_VISIBLE_MAX) break;
    prefetchChatHistory(chat);
  }
}

/** True when a usable first page is already in memory. */
export function hasPrefetchedChatHistory(chatId: number): boolean {
  const cached = getCachedChatHistory(chatId);
  return cached != null && cached.messages.length > 0 && !cached.error;
}
