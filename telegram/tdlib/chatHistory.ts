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
): Promise<{ chat_kind: ChatKind; messages: MappedChatHistoryMessage[] }> {
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

  const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
  const chatKind = chatKindFromTdChat(chat);

  const loadPage = async (): Promise<TdMessage[]> => {
    const history = (await client.invoke({
      _: "getChatHistory",
      chat_id: chatId,
      from_message_id: loadOlder ? beforeMessageId! : 0,
      offset: loadOlder ? -pageLimit : 0,
      limit: pageLimit,
      only_local: false,
    })) as { messages?: TdMessage[] };
    const raw = Array.isArray(history.messages) ? history.messages : [];
    return raw.filter((message) => {
      const telegramMessageId = Number(message.id);
      if (!loadOlder) return true;
      if (!Number.isFinite(telegramMessageId)) return false;
      return telegramMessageId < beforeMessageId!;
    });
  };

  let raw = await loadPage();
  if (!loadOlder && raw.length < Math.min(pageLimit, 5)) {
    await sleep(600);
    raw = await loadPage();
  }

  const messages = await mapHistoryBatch(client, raw, chat);
  return { chat_kind: chatKind, messages };
}
