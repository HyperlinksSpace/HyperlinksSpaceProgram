import { buildApiUrl } from "../../../api/_base";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import type { MessageChatRowData } from "./MessageChatRow";

function resolveStoredAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw || raw === TELEGRAM_THREAD_NO_AVATAR) return null;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return buildApiUrl(raw.startsWith("/") ? raw : `/${raw}`);
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

  if (inChannelThread || item?.sender_is_channel) {
    const stored = resolveStoredAvatarUrl(chat.avatar_url);
    if (stored) return stored;
    return buildApiUrl(`/api/telegram-messages-avatar?chat_id=${chat.telegram_chat_id}`);
  }

  if (item?.sender_chat_id != null) {
    return buildApiUrl(`/api/telegram-messages-avatar?chat_id=${item.sender_chat_id}`);
  }

  if (item?.sender_user_id != null) {
    return buildApiUrl(`/api/telegram-messages-avatar?user_id=${item.sender_user_id}`);
  }

  const stored = resolveStoredAvatarUrl(chat.avatar_url);
  if (stored) return stored;
  return buildApiUrl(`/api/telegram-messages-avatar?chat_id=${chat.telegram_chat_id}`);
}
