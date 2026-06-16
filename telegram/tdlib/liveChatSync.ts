import type { Client } from "tdl";
import { touchMtprotoSync } from "../../database/telegramMtproto.js";
import { refreshChatThreadFromTdlib } from "./syncChats.js";

const CHAT_REFRESH_DEBOUNCE_MS = 350;

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

function scheduleChatRefresh(record: LiveSyncRecord, chatId: number): void {
  const userKey = record.telegramUsername;
  let userTimers = refreshTimers.get(userKey);
  if (!userTimers) {
    userTimers = new Map();
    refreshTimers.set(userKey, userTimers);
  }
  if (userTimers.has(chatId)) return;

  const timer = setTimeout(() => {
    userTimers!.delete(chatId);
    void (async () => {
      const client = record.client;
      if (!client || record.authState !== "ready") return;
      try {
        await refreshChatThreadFromTdlib(client, record.telegramUsername, chatId);
        await touchMtprotoSync(record.telegramUsername);
        logLiveSync(record, "live_chat_refreshed", { chatId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logLiveSync(record, "live_chat_refresh_error", { chatId, message });
      }
    })();
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
    const chatId = chatIdFromUpdate(update);
    if (chatId == null) return;
    scheduleChatRefresh(record, chatId);
  });

  logLiveSync(record, "live_chat_sync_attached");
}

export function detachLiveChatSync(telegramUsername: string): void {
  const userTimers = refreshTimers.get(telegramUsername);
  if (!userTimers) return;
  for (const timer of userTimers.values()) clearTimeout(timer);
  refreshTimers.delete(telegramUsername);
}
