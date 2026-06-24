import type { Client } from "tdl";
import {
  chatKindFromTdChat,
  mapHistoryMessage,
  type ChatKind,
  type MappedChatHistoryMessage,
} from "./messageHistoryMap.js";
import type { TdChat, TdMessage } from "./chatPreview.js";

export type { ChatKind, MappedChatHistoryMessage };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  rows.sort((a, b) => {
    const byTime = Date.parse(a.sent_at) - Date.parse(b.sent_at);
    if (byTime !== 0) return byTime;
    return a.telegram_message_id - b.telegram_message_id;
  });
  return rows;
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
    const history = (await client.invoke({
      _: "getChatHistory",
      chat_id: chatId,
      from_message_id:
        typeof cursorMessageId === "number" && Number.isFinite(cursorMessageId) && cursorMessageId > 0
          ? cursorMessageId
          : 0,
      offset:
        typeof cursorMessageId === "number" && Number.isFinite(cursorMessageId) && cursorMessageId > 0
          ? -rawBatchLimit
          : 0,
      limit: rawBatchLimit,
      only_local: false,
    })) as { messages?: TdMessage[] };
    const raw = Array.isArray(history.messages) ? history.messages : [];
    return raw.filter((message) => {
      const telegramMessageId = Number(message.id);
      if (
        typeof cursorMessageId !== "number" ||
        !Number.isFinite(cursorMessageId) ||
        cursorMessageId <= 0
      ) {
        return true;
      }
      return Number.isFinite(telegramMessageId) && telegramMessageId < cursorMessageId;
    });
  };

  let raw = await loadPage(loadOlder ? beforeMessageId! : null);
  if (!loadOlder && raw.length < Math.min(rawBatchLimit, 5)) {
    await sleep(600);
    raw = await loadPage(null);
  }
  const mappedById = new Map<number, MappedChatHistoryMessage>();
  let currentRaw = raw;
  let nextBeforeMessageId: number | null = null;
  let hasMoreOlder = false;
  let batches = 0;

  while (currentRaw.length > 0 && batches < 10) {
    const mapped = await mapHistoryBatch(client, currentRaw, chat);
    for (const row of mapped) {
      mappedById.set(row.telegram_message_id, row);
    }

    const oldestRawMessageId = currentRaw.reduce<number | null>((oldest, message) => {
      const telegramMessageId = Number(message.id);
      if (!Number.isFinite(telegramMessageId) || telegramMessageId <= 0) return oldest;
      if (oldest == null || telegramMessageId < oldest) return telegramMessageId;
      return oldest;
    }, null);

    if (oldestRawMessageId == null) {
      hasMoreOlder = false;
      break;
    }

    nextBeforeMessageId = oldestRawMessageId;
    hasMoreOlder = currentRaw.length >= rawBatchLimit;
    if (mappedById.size >= pageLimit || !hasMoreOlder) {
      break;
    }

    currentRaw = await loadPage(nextBeforeMessageId);
    batches += 1;
  }

  const messages = [...mappedById.values()]
    .sort((a, b) => {
      const byTime = Date.parse(a.sent_at) - Date.parse(b.sent_at);
      if (byTime !== 0) return byTime;
      return a.telegram_message_id - b.telegram_message_id;
    })
    .slice(-pageLimit);

  return {
    chat_kind: chatKind,
    messages,
    has_more_older: hasMoreOlder,
    next_before_message_id: hasMoreOlder ? nextBeforeMessageId : null,
  };
}
