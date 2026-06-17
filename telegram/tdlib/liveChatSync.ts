import type { Client } from "tdl";
import { clearLiveChatCache, patchLiveChatFromTdlib } from "./liveChatCache.js";
import { previewFromMessage, type TdChat, type TdMessage } from "./chatPreview.js";

const CHAT_REFRESH_DEBOUNCE_MS = 800;

const LIVE_UPDATE_TYPES = new Set([
  "updateNewMessage",
  "updateChatLastMessage",
  "updateChatReadInbox",
  "updateNewChat",
  "updateChatTitle",
  "updateChatPhoto",
  "updateChatPosition",
  "updateMessageEdited",
  "updateDeleteMessages",
]);

type LiveSyncRecord = {
  attemptId: string;
  telegramUsername: string;
  get authState(): string;
  client: Client | null;
};

const refreshTimers = new Map<string, Map<number, ReturnType<typeof setTimeout>>>();
const attachedClients = new WeakSet<Client>();

function logLiveSync(record: LiveSyncRecord, event: string, extra?: Record<string, unknown>): void {
  console.log(
    `[tdlib-gateway] ${JSON.stringify({
      event,
      attemptId: record.attemptId,
      telegramUsername: record.telegramUsername,
      authState: record.authState,
      ...extra,
    })}`,
  );
}

function chatIdFromUpdate(update: Record<string, unknown>): number | null {
  const type = update._;
  if (type === "updateNewMessage") {
    const msg = update.message as { chat_id?: number } | undefined;
    return typeof msg?.chat_id === "number" ? msg.chat_id : null;
  }
  if (
    type === "updateChatLastMessage" ||
    type === "updateChatReadInbox" ||
    type === "updateChatTitle" ||
    type === "updateChatPhoto" ||
    type === "updateChatPosition"
  ) {
    return typeof update.chat_id === "number" ? update.chat_id : null;
  }
  if (type === "updateNewChat") {
    const chat = update.chat as { id?: number } | undefined;
    return typeof chat?.id === "number" ? chat.id : null;
  }
  if (type === "updateMessageEdited" || type === "updateDeleteMessages") {
    const chatId = update.chat_id;
    return typeof chatId === "number" ? chatId : null;
  }
  return null;
}

async function applyLiveUpdate(record: LiveSyncRecord, update: Record<string, unknown>): Promise<void> {
  const client = record.client;
  if (!client || record.authState !== "ready") return;

  const type = update._;

  if (type === "updateNewMessage") {
    const message = update.message as TdMessage & { chat_id?: number };
    if (typeof message?.chat_id !== "number") return;
    try {
      const chat = (await client.invoke({ _: "getChat", chat_id: message.chat_id })) as TdChat;
      patchLiveChatFromTdlib(record.telegramUsername, chat, {
        subtitle: previewFromMessage(message),
        last_message: message,
      });
      logLiveSync(record, "live_chat_message_applied", {
        chatId: message.chat_id,
        preview: previewFromMessage(message),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLiveSync(record, "live_chat_message_error", { chatId: message.chat_id, message: msg });
    }
    return;
  }

  if (type === "updateChatLastMessage") {
    const chatId = update.chat_id;
    const lastMessage = update.last_message as TdMessage | undefined;
    if (typeof chatId !== "number") return;
    try {
      const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
      patchLiveChatFromTdlib(record.telegramUsername, chat, {
        subtitle: lastMessage ? previewFromMessage(lastMessage) : null,
        last_message: lastMessage ?? chat.last_message ?? null,
      });
    } catch {
      /* ignore */
    }
    logLiveSync(record, "live_chat_last_message_applied", { chatId });
    return;
  }

  if (type === "updateChatReadInbox") {
    const chatId = update.chat_id;
    if (typeof chatId !== "number") return;
    try {
      const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
      patchLiveChatFromTdlib(record.telegramUsername, chat, { last_message: chat.last_message ?? null });
    } catch {
      /* ignore */
    }
    return;
  }

  if (type === "updateNewChat") {
    const chat = update.chat as TdChat | undefined;
    if (!chat?.id) return;
    patchLiveChatFromTdlib(record.telegramUsername, chat, {});
    return;
  }

  const chatId = chatIdFromUpdate(update);
  if (chatId == null) return;

  try {
    const chat = (await client.invoke({ _: "getChat", chat_id: chatId })) as TdChat;
    patchLiveChatFromTdlib(record.telegramUsername, chat, { last_message: chat.last_message ?? null });
    logLiveSync(record, "live_chat_refreshed", { chatId, updateType: type });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logLiveSync(record, "live_chat_refresh_error", { chatId, message });
  }
}

function scheduleChatRefresh(record: LiveSyncRecord, chatId: number, update: Record<string, unknown>): void {
  const userKey = record.telegramUsername;
  let userTimers = refreshTimers.get(userKey);
  if (!userTimers) {
    userTimers = new Map();
    refreshTimers.set(userKey, userTimers);
  }
  if (userTimers.has(chatId)) return;

  const timer = setTimeout(() => {
    userTimers!.delete(chatId);
    void applyLiveUpdate(record, update);
  }, CHAT_REFRESH_DEBOUNCE_MS);

  userTimers.set(chatId, timer);
}

export function attachLiveChatSync(record: LiveSyncRecord): void {
  const client = record.client;
  if (!client || attachedClients.has(client)) return;
  attachedClients.add(client);

  client.on("update", (update: Record<string, unknown>) => {
    if (record.authState !== "ready") return;
    const type = update._;
    if (typeof type !== "string" || !LIVE_UPDATE_TYPES.has(type)) return;

    if (type === "updateNewMessage" || type === "updateChatLastMessage") {
      void applyLiveUpdate(record, update);
      return;
    }

    const chatId = chatIdFromUpdate(update);
    if (chatId == null) return;
    scheduleChatRefresh(record, chatId, update);
  });

  logLiveSync(record, "live_chat_sync_attached");
}

export function detachLiveChatSync(telegramUsername: string): void {
  const userTimers = refreshTimers.get(telegramUsername);
  if (userTimers) {
    for (const timer of userTimers.values()) clearTimeout(timer);
    refreshTimers.delete(telegramUsername);
  }
  clearLiveChatCache(telegramUsername);
}
