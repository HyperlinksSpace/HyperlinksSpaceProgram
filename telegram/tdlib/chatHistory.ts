import type { Client } from "tdl";
import {
  applyReadOutboxToHistoryMessages,
  applyCumulativeOutgoingReadStatuses,
  chatKindFromTdChat,
  effectiveReadOutboxMessageId,
  enrichOutgoingReadStatuses,
  mapHistoryMessage,
  type ChatKind,
  type MappedChatHistoryMessage,
} from "./messageHistoryMap.js";
import { lastReadOutboxMessageIdFromChat, type TdChat, type TdMessage } from "./chatPreview.js";

export type { ChatKind, MappedChatHistoryMessage };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sortHistoryMessages(rows: MappedChatHistoryMessage[]): MappedChatHistoryMessage[] {
  return [...rows].sort((a, b) => {
    const byTime = Date.parse(a.sent_at) - Date.parse(b.sent_at);
    if (byTime !== 0) return byTime;
    return a.telegram_message_id - b.telegram_message_id;
  });
}

function oldestRawMessageId(messages: TdMessage[]): number | null {
  let oldest: number | null = null;
  for (const message of messages) {
    const telegramMessageId = Number(message.id);
    if (!Number.isFinite(telegramMessageId) || telegramMessageId <= 0) continue;
    if (oldest == null || telegramMessageId < oldest) oldest = telegramMessageId;
  }
  return oldest;
}

async function mapHistoryBatch(
  client: Client,
  messages: TdMessage[],
  chat: TdChat,
): Promise<MappedChatHistoryMessage[]> {
  const userCache = new Map<number, string>();
  const chatCache = new Map<number, { title: string; isChannel: boolean }>();
  const mapped = await Promise.all(
    messages.map((message) => mapHistoryMessage(client, message, chat, userCache, chatCache)),
  );
  const rows: MappedChatHistoryMessage[] = [];
  const seenIds = new Set<number>();
  for (const row of mapped) {
    if (!row) continue;
    if (seenIds.has(row.telegram_message_id)) continue;
    seenIds.add(row.telegram_message_id);
    rows.push(row);
  }
  return sortHistoryMessages(rows);
}

export async function fetchChatHistory(
  client: Client,
  chatId: number,
  limit = 50,
  beforeMessageId?: number | null,
): Promise<{
  chat_kind: ChatKind;
  messages: MappedChatHistoryMessage[];
  has_more_older: boolean;
  next_before_message_id: number | null;
  last_read_outbox_message_id: number | null;
}> {
  try {
    await client.invoke({ _: "openChat", chat_id: chatId });
  } catch {
    /* already open */
  }

  const pageLimit = Math.min(Math.max(limit, 1), 100);
  const loadOlder =
    typeof beforeMessageId === "number" &&
    Number.isFinite(beforeMessageId) &&
    beforeMessageId > 0;
  const rawBatchLimit = Math.min(100, Math.max(pageLimit, 50));

  const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const chatKind = chatKindFromTdChat(chat);

  const loadPage = async (cursorMessageId?: number | null): Promise<TdMessage[]> => {
    const fromMessageId =
      typeof cursorMessageId === "number" &&
      Number.isFinite(cursorMessageId) &&
      cursorMessageId > 0
        ? cursorMessageId
        : 0;
    const requestLimit =
      fromMessageId > 0 ? Math.min(100, pageLimit + 1) : rawBatchLimit;
    // TDLib: offset 0 starts at from_message_id; negative offset adds *newer* messages.
    const history = (await client.invoke({
      _: "getChatHistory",
      chat_id: chatId,
      from_message_id: fromMessageId,
      offset: 0,
      limit: requestLimit,
      only_local: false,
    })) as { messages?: TdMessage[] };
    const raw = Array.isArray(history.messages) ? history.messages : [];
    return raw.filter((message) => {
      const telegramMessageId = Number(message.id);
      if (fromMessageId <= 0) return true;
      return Number.isFinite(telegramMessageId) && telegramMessageId < fromMessageId;
    });
  };

  const mappedById = new Map<number, MappedChatHistoryMessage>();
  let cursorMessageId: number | null = loadOlder ? beforeMessageId! : null;
  let lastBatchWasFull = false;
  let lastRawOldestId: number | null = null;
  let batches = 0;
  const maxBatches = 20;
  const batchFullThreshold = loadOlder ? pageLimit : rawBatchLimit;

  while (batches < maxBatches) {
    let raw = await loadPage(cursorMessageId);
    if (!loadOlder && batches === 0 && raw.length < Math.min(rawBatchLimit, 5)) {
      await sleep(600);
      raw = await loadPage(null);
    }
    if (raw.length === 0) {
      lastBatchWasFull = false;
      break;
    }

    lastBatchWasFull = raw.length >= batchFullThreshold;
    lastRawOldestId = oldestRawMessageId(raw) ?? lastRawOldestId;
    const freshChat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
    const mapped = await mapHistoryBatch(client, raw, freshChat);
    for (const row of mapped) {
      mappedById.set(row.telegram_message_id, row);
    }

    if (mappedById.size >= pageLimit || !lastBatchWasFull) {
      break;
    }

    const oldestRawId = oldestRawMessageId(raw);
    if (oldestRawId == null) {
      lastBatchWasFull = false;
      break;
    }
    cursorMessageId = oldestRawId;
    batches += 1;
  }

  const sorted = sortHistoryMessages([...mappedById.values()]);
  const finalChat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const pageSlice = sorted.slice(-pageLimit);
  let messages = applyReadOutboxToHistoryMessages(pageSlice, finalChat);
  if (chatKind === "private") {
    messages = await enrichOutgoingReadStatuses(client, finalChat, messages);
    messages = applyReadOutboxToHistoryMessages(messages, finalChat);
    messages = applyCumulativeOutgoingReadStatuses(messages);
  }
  const oldestReturnedId = messages[0]?.telegram_message_id ?? null;
  const hasMoreOlder = loadOlder
    ? messages.length >= pageLimit ||
      (messages.length === 0 && lastBatchWasFull && lastRawOldestId != null)
    : sorted.length > pageLimit || (lastBatchWasFull && oldestReturnedId != null);
  const nextBeforeMessageId = loadOlder
    ? messages.length > 0
      ? hasMoreOlder
        ? oldestReturnedId
        : null
      : lastBatchWasFull && lastRawOldestId != null
        ? lastRawOldestId
        : null
    : hasMoreOlder && oldestReturnedId != null
      ? oldestReturnedId
      : null;

  const lastReadOutbox = effectiveReadOutboxMessageId(
    lastReadOutboxMessageIdFromChat(finalChat),
    ...messages
      .filter((row) => row.is_outgoing && row.outgoing_status === "read")
      .map((row) => row.telegram_message_id),
  );

  return {
    chat_kind: chatKind,
    messages,
    has_more_older: hasMoreOlder,
    next_before_message_id: nextBeforeMessageId,
    last_read_outbox_message_id: lastReadOutbox,
  };
}

const MAX_OUTGOING_TEXT_LENGTH = 4096;

export async function sendChatTextMessage(
  client: Client,
  chatId: number,
  text: string,
): Promise<MappedChatHistoryMessage | null> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_OUTGOING_TEXT_LENGTH) return null;

  try {
    await client.invoke({ _: "openChat", chat_id: chatId });
  } catch {
    /* already open or TDLib will reject send with a clearer error */
  }

  const message = (await client.invoke({
    _: "sendMessage",
    chat_id: chatId,
    input_message_content: {
      _: "inputMessageText",
      text: {
        _: "formattedText",
        text: trimmed,
        entities: [],
      },
    },
  })) as TdMessage;

  const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const mapped = await mapHistoryMessage(client, message, chat, new Map(), new Map());
  if (!mapped || !mapped.is_outgoing) return mapped;
  if (mapped.outgoing_status === "failed") return mapped;
  return { ...mapped, outgoing_status: "delivered" };
}
