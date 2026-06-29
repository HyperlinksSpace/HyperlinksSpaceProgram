import { buildApiUrl } from "../../../api/_base";
import { safeTelegramUserIdForLog } from "../../../shared/appLog";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import type { MessageChatRowData } from "./MessageChatRow";

function resolveStoredAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw || raw === TELEGRAM_THREAD_NO_AVATAR) return null;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return buildApiUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

function validChatIdForAvatar(id: unknown): number | null {
  const chatId = Number(id);
  if (!Number.isFinite(chatId) || chatId === 0) return null;
  return Math.trunc(chatId);
}

function avatarProxyUrl(params: { userId?: number | null; chatId?: number | null }): string | null {
  const userId = safeTelegramUserIdForLog(params.userId);
  if (userId != null) {
    return buildApiUrl(`/api/telegram-messages-avatar?user_id=${userId}`);
  }
  const chatId = validChatIdForAvatar(params.chatId);
  if (chatId != null) {
    return buildApiUrl(`/api/telegram-messages-avatar?chat_id=${chatId}`);
  }
  return null;
}

function isPrivateChatContext(
  chat: MessageChatRowData,
  chatKind: MessageChatKind | null | undefined,
): boolean {
  if (chatKind === "private") return true;
  if (chatKind != null) return false;
  return safeTelegramUserIdForLog(chat.peer_user_id) != null;
}

/** Avatar for a chat list row or an open-thread message bubble. */
export function resolveTelegramThreadAvatarUrl(
  chat: MessageChatRowData,
  item?: Pick<
    MessageChatHistoryItem,
    "sender_user_id" | "sender_chat_id" | "sender_is_channel"
  > | null,
  chatKind?: MessageChatKind | null,
): string | null {
  const inChannelThread = chatKind === "channel";
  const storedChatAvatar = resolveStoredAvatarUrl(chat.avatar_url);
  const privateChat = isPrivateChatContext(chat, chatKind);

  if (inChannelThread || item?.sender_is_channel) {
    if (storedChatAvatar) return storedChatAvatar;
    return avatarProxyUrl({ chatId: chat.telegram_chat_id });
  }

  if (privateChat && storedChatAvatar) {
    return storedChatAvatar;
  }

  const senderChatId = validChatIdForAvatar(item?.sender_chat_id);
  if (senderChatId != null) {
    return avatarProxyUrl({ chatId: senderChatId });
  }

  const senderUserId = safeTelegramUserIdForLog(item?.sender_user_id);
  if (senderUserId != null) {
    return avatarProxyUrl({ userId: senderUserId });
  }

  if (storedChatAvatar) return storedChatAvatar;

  const peerUserId = safeTelegramUserIdForLog(chat.peer_user_id);
  if (peerUserId != null) {
    return avatarProxyUrl({ userId: peerUserId });
  }

  return avatarProxyUrl({ chatId: chat.telegram_chat_id });
}
