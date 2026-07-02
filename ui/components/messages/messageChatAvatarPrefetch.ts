import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import type { MessageChatRowData } from "./MessageChatRow";
import {
  isMessageChatAvatarBlobCached,
  prefetchMessageChatAvatar,
} from "./MessageChatAvatarImage";
import { resolveTelegramThreadAvatarUrl } from "./resolveTelegramThreadAvatarUrl";
import { logPageDisplay } from "../../pageDisplayLog";

const OPEN_CHAT_AVATAR_PREFETCH_MAX = 48;
let openChatAvatarPriorityId: number | null = null;

/** While set, only the open chat should use high-priority avatar fetches. */
export function setOpenChatAvatarPriority(chatId: number | null): void {
  openChatAvatarPriorityId = Number.isFinite(chatId) ? Math.trunc(chatId!) : null;
}

export function isOpenChatAvatarPriority(chatId: number): boolean {
  return openChatAvatarPriorityId === chatId;
}

function collectAvatarUrls(
  chat: MessageChatRowData,
  messages: readonly MessageChatHistoryItem[],
  chatKind: MessageChatKind | null,
): string[] {
  const uris: string[] = [];
  const seen = new Set<string>();

  const push = (url: string | null) => {
    if (!url || seen.has(url) || isMessageChatAvatarBlobCached(url)) return;
    seen.add(url);
    uris.push(url);
  };

  push(resolveTelegramThreadAvatarUrl(chat, null, chatKind));

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]!;
    if (item.is_outgoing) continue;
    push(resolveTelegramThreadAvatarUrl(chat, item, chatKind));
    if (uris.length >= OPEN_CHAT_AVATAR_PREFETCH_MAX) break;
  }

  return uris;
}

/** Warm avatar proxy blobs for the open chat before rows mount. */
export function prefetchOpenChatAvatars(
  chat: MessageChatRowData,
  messages: readonly MessageChatHistoryItem[],
  chatKind: MessageChatKind | null,
): void {
  const chatId = chat.telegram_chat_id;
  if (!Number.isFinite(chatId)) return;

  setOpenChatAvatarPriority(chatId);
  const uris = collectAvatarUrls(chat, messages, chatKind);
  if (uris.length === 0) return;

  logPageDisplay("messages_avatar_prefetch_open_chat", {
    chatId,
    count: uris.length,
  });

  for (const uri of uris) {
    prefetchMessageChatAvatar(uri, { priority: "high" });
  }
}

/** List-row avatar for the chat being opened. */
export function prefetchOpenChatListAvatar(chat: MessageChatRowData, chatKind?: MessageChatKind | null): void {
  const chatId = chat.telegram_chat_id;
  if (!Number.isFinite(chatId)) return;
  setOpenChatAvatarPriority(chatId);
  const uri = resolveTelegramThreadAvatarUrl(chat, null, chatKind ?? chat.chat_kind ?? null);
  if (uri) prefetchMessageChatAvatar(uri, { priority: "high" });
}
