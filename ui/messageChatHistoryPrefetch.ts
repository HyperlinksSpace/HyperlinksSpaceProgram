import type { MessageChatRowData } from "./components/messages/MessageChatRow";
import {
  getCachedChatHistory,
  isChatHistoryCacheFresh,
  setCachedChatHistory,
} from "./messageChatHistoryCache";
import { logPageDisplay } from "./pageDisplayLog";
import { loadTelegramChatHistoryFirstPage } from "./telegram/fetchTelegramChatHistoryPage";

const PREFETCH_TOP_N = 12;
const MAX_CONCURRENT = 2;

const inFlight = new Map<number, Promise<void>>();
const queued: Array<{ chatId: number; peerUserId: number | null; priority: boolean }> = [];
let activeCount = 0;

async function prefetchChatHistoryNow(
  chatId: number,
  peerUserId: number | null,
  options?: { warmup?: boolean },
): Promise<void> {
  const started = Date.now();
  const result = await loadTelegramChatHistoryFirstPage(chatId, peerUserId, {
    warmup: options?.warmup !== false,
  });
  if (!result.error && result.messages.length > 0) {
    setCachedChatHistory(chatId, result);
    logPageDisplay("messages_history_prefetch_ok", {
      chatId,
      count: result.messages.length,
      elapsedMs: Date.now() - started,
      priority: options?.warmup === true,
    });
    return;
  }
  if (result.error) {
    logPageDisplay("messages_history_prefetch_skip", {
      chatId,
      error: result.error,
      elapsedMs: Date.now() - started,
      priority: options?.warmup === true,
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
  priority = false,
): void {
  if (!Number.isFinite(chatId)) return;
  if (isChatHistoryCacheFresh(chatId) || inFlight.has(chatId)) return;

  const existingIdx = queued.findIndex((row) => row.chatId === chatId);
  if (existingIdx >= 0) {
    if (priority) {
      const [row] = queued.splice(existingIdx, 1);
      if (row) queued.unshift({ ...row, priority: true });
      scheduleDrain();
    }
    return;
  }

  const row = {
    chatId,
    peerUserId: Number.isFinite(Number(peerUserId)) ? Number(peerUserId) : null,
    priority,
  };
  if (priority) queued.unshift(row);
  else queued.push(row);
  scheduleDrain();
}

/** Prefetch first history page for one chat (deduped). */
export function prefetchChatHistory(
  chat: Pick<MessageChatRowData, "telegram_chat_id" | "peer_user_id">,
): void {
  enqueuePrefetch(chat.telegram_chat_id, chat.peer_user_id ?? null);
}

/** High-priority prefetch for the open chat — jumps the queue and warms the gateway. */
export function prefetchChatHistoryPriority(
  chat: Pick<MessageChatRowData, "telegram_chat_id" | "peer_user_id">,
): void {
  const chatId = chat.telegram_chat_id;
  if (!Number.isFinite(chatId)) return;
  if (isChatHistoryCacheFresh(chatId)) return;

  if (inFlight.has(chatId)) return;

  const existingIdx = queued.findIndex((row) => row.chatId === chatId);
  if (existingIdx >= 0) queued.splice(existingIdx, 1);

  activeCount += 1;
  const promise = prefetchChatHistoryNow(chatId, chat.peer_user_id ?? null, { warmup: true }).finally(
    () => {
      activeCount -= 1;
      inFlight.delete(chatId);
      scheduleDrain();
    },
  );
  inFlight.set(chatId, promise);
}

/** Warm cache for visible chats after the chat list loads. */
export function prefetchChatHistoryForList(
  chats: readonly MessageChatRowData[],
  options?: { skipChatId?: number | null },
): void {
  if (chats.length === 0) return;
  const skipId = options?.skipChatId ?? null;
  for (const chat of chats) {
    if (skipId != null && chat.telegram_chat_id === skipId) continue;
    if (queued.length + inFlight.size >= PREFETCH_TOP_N) break;
    enqueuePrefetch(chat.telegram_chat_id, chat.peer_user_id ?? null);
  }
}

/** True when a usable first page is already in memory. */
export function hasPrefetchedChatHistory(chatId: number): boolean {
  const cached = getCachedChatHistory(chatId);
  return cached != null && cached.messages.length > 0 && !cached.error;
}
