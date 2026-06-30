import type { MessageChatRowData } from "./MessageChatRow";

/** Group / supergroup / channel rows show member count instead of last-seen presence. */
export function isGroupLikeChatRow(chat: MessageChatRowData): boolean {
  // TDLib private chats use the peer's positive user id; groups/channels are always negative.
  if (chat.telegram_chat_id < 0) return true;
  const kind = chat.chat_kind;
  if (kind === "group" || kind === "supergroup" || kind === "channel") return true;
  if (kind === "private") return false;
  if (chat.chat_username?.trim()) return true;
  return chat.peer_user_id == null;
}
