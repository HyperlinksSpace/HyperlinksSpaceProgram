import type { MessageChatRowData } from "./components/messages/MessageChatRow";
import {
  MESSAGE_CHAT_HISTORY_PAGE_SIZE,
  MESSAGE_CHAT_HISTORY_PREVIEW_SIZE,
} from "./components/messages/messageChatLayout";
import type { ChatHistoryPageResult } from "./telegram/fetchTelegramChatHistoryPage";
import { loadTelegramChatHistoryFirstPage } from "./telegram/fetchTelegramChatHistoryPage";
import {
  type CachedChatHistoryPage,
  getCachedChatHistory,
  isChatHistoryCacheComplete,
  isChatHistoryCacheFresh,
  PREVIEW_FRESH_MS,
  setCachedChatHistory,
} from "./messageChatHistoryCache";
import { logPageDisplay } from "./pageDisplayLog";

/** Max visible chats we warm in the background (viewport-driven). */
const PREFETCH_VISIBLE_MAX = 7;
const MAX_BACKGROUND_CONCURRENT = 2;

type LoadSpec = {
  warmup: boolean;
  limit: number;
  previewOnly: boolean;
};

const sharedLoads = new Map<number, Promise<ChatHistoryPageResult>>();
const inFlightBackground = new Map<number, Promise<void>>();
const queued: Array<{
  chatId: number;
  peerUserId: number | null;
  spec: LoadSpec;
}> = [];
let backgroundActive = 0;
/** While set, background list prefetch is paused so the open chat wins gateway time. */
let openChatLoadingId: number | null = null;

function toPageResult(cached: CachedChatHistoryPage): ChatHistoryPageResult {
  const { fetchedAt: _fetchedAt, previewOnly: _previewOnly, ...page } = cached;
  return page;
}

function isFullPageSpec(spec: LoadSpec): boolean {
  return !spec.previewOnly && spec.limit >= MESSAGE_CHAT_HISTORY_PAGE_SIZE;
}

async function runHistoryLoad(
  chatId: number,
  peerUserId: number | null,
  spec: LoadSpec,
): Promise<ChatHistoryPageResult> {
  const started = Date.now();
  const result = await loadTelegramChatHistoryFirstPage(chatId, peerUserId, {
    warmup: spec.warmup,
    limit: spec.limit,
  });
  if (!result.error && result.messages.length > 0) {
    setCachedChatHistory(chatId, result, { previewOnly: spec.previewOnly });
    logPageDisplay("messages_history_prefetch_ok", {
      chatId,
      count: result.messages.length,
      elapsedMs: Date.now() - started,
      previewOnly: spec.previewOnly,
      limit: spec.limit,
      lane: spec.previewOnly ? "preview" : "full",
    });
  } else if (result.error) {
    logPageDisplay("messages_history_prefetch_skip", {
      chatId,
      error: result.error,
      elapsedMs: Date.now() - started,
      previewOnly: spec.previewOnly,
      limit: spec.limit,
      lane: spec.previewOnly ? "preview" : "full",
    });
  }
  return result;
}

function startSharedLoad(
  chatId: number,
  peerUserId: number | null,
  spec: LoadSpec,
): Promise<ChatHistoryPageResult> {
  const existing = sharedLoads.get(chatId);
  if (existing) {
    if (isFullPageSpec(spec)) {
      return existing.then(async (prior) => {
        if (prior.error) {
          return prior;
        }
        if (isChatHistoryCacheComplete(chatId) && isChatHistoryCacheFresh(chatId)) {
          const cached = getCachedChatHistory(chatId);
          return cached ? toPageResult(cached) : prior;
        }
        if (sharedLoads.has(chatId)) {
          return sharedLoads.get(chatId)!;
        }
        return startSharedLoad(chatId, peerUserId, spec);
      });
    }
    return existing;
  }

  const promise = runHistoryLoad(chatId, peerUserId, spec).finally(() => {
    if (sharedLoads.get(chatId) === promise) {
      sharedLoads.delete(chatId);
    }
  });
  sharedLoads.set(chatId, promise);
  return promise;
}

function scheduleBackgroundDrain(): void {
  if (openChatLoadingId != null) return;
  while (backgroundActive < MAX_BACKGROUND_CONCURRENT && queued.length > 0) {
    const next = queued.shift();
    if (!next) break;

    const freshMs = next.spec.previewOnly ? PREVIEW_FRESH_MS : undefined;
    if (isChatHistoryCacheFresh(next.chatId, freshMs) || sharedLoads.has(next.chatId)) {
      continue;
    }

    backgroundActive += 1;
    const promise = startSharedLoad(next.chatId, next.peerUserId, next.spec)
      .finally(() => {
        backgroundActive -= 1;
        inFlightBackground.delete(next.chatId);
        scheduleBackgroundDrain();
      });
    inFlightBackground.set(next.chatId, promise.then(() => undefined));
  }
}

function enqueueBackgroundPrefetch(
  chatId: number,
  peerUserId: number | null | undefined,
  spec: LoadSpec,
): void {
  if (!Number.isFinite(chatId)) return;
  if (openChatLoadingId != null) return;

  const freshMs = spec.previewOnly ? PREVIEW_FRESH_MS : undefined;
  if (isChatHistoryCacheFresh(chatId, freshMs) || sharedLoads.has(chatId)) return;

  const existingIdx = queued.findIndex((row) => row.chatId === chatId);
  if (existingIdx >= 0) {
    queued.splice(existingIdx, 1);
  }

  if (queued.length + inFlightBackground.size >= PREFETCH_VISIBLE_MAX) return;

  queued.push({
    chatId,
    peerUserId: Number.isFinite(Number(peerUserId)) ? Number(peerUserId) : null,
    spec,
  });
  scheduleBackgroundDrain();
}

/** Open chat history — highest priority, deduped, pauses background prefetch. */
export async function loadOpenChatHistoryFirstPage(
  chatId: number,
  peerUserId: number | null | undefined,
): Promise<ChatHistoryPageResult> {
  if (!Number.isFinite(chatId)) {
    return {
      messages: [],
      chatKind: null,
      error: "invalid_chat_id",
      hasMoreOlder: false,
      nextBeforeMessageId: null,
      lastReadOutboxMessageId: null,
      memberCount: null,
      selfUserId: null,
    };
  }

  openChatLoadingId = chatId;
  try {
    const cached = getCachedChatHistory(chatId);
    if (cached && !cached.previewOnly && isChatHistoryCacheFresh(chatId)) {
      return toPageResult(cached);
    }
    return await startSharedLoad(chatId, peerUserId ?? null, {
      warmup: true,
      limit: MESSAGE_CHAT_HISTORY_PAGE_SIZE,
      previewOnly: false,
    });
  } finally {
    if (openChatLoadingId === chatId) {
      openChatLoadingId = null;
    }
    scheduleBackgroundDrain();
  }
}

/** True while the open chat is loading history (background prefetch is paused). */
export function isOpenChatHistoryLoading(): boolean {
  return openChatLoadingId != null;
}

/** Prefetch a short preview page when a list row scrolls into view. */
export function prefetchChatHistory(
  chat: Pick<MessageChatRowData, "telegram_chat_id" | "peer_user_id">,
): void {
  if (openChatLoadingId != null) return;
  enqueueBackgroundPrefetch(chat.telegram_chat_id, chat.peer_user_id ?? null, {
    warmup: false,
    limit: MESSAGE_CHAT_HISTORY_PREVIEW_SIZE,
    previewOnly: true,
  });
}

/** Warm the open chat — shares the same in-flight load as {@link loadOpenChatHistoryFirstPage}. */
export function prefetchChatHistoryPriority(
  chat: Pick<MessageChatRowData, "telegram_chat_id" | "peer_user_id">,
): void {
  const chatId = chat.telegram_chat_id;
  if (!Number.isFinite(chatId)) return;
  const cached = getCachedChatHistory(chatId);
  if (cached && !cached.previewOnly && isChatHistoryCacheFresh(chatId)) return;
  if (sharedLoads.has(chatId)) return;
  if (cached?.previewOnly && isChatHistoryCacheFresh(chatId, PREVIEW_FRESH_MS)) return;
  void loadOpenChatHistoryFirstPage(chatId, chat.peer_user_id ?? null);
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
    if (queued.length + inFlightBackground.size >= PREFETCH_VISIBLE_MAX) break;
    prefetchChatHistory(chat);
  }
}

/** True when a usable first page is already in memory. */
export function hasPrefetchedChatHistory(chatId: number): boolean {
  const cached = getCachedChatHistory(chatId);
  return cached != null && cached.messages.length > 0 && !cached.error;
}
