import type { MessageChatRowData } from "./MessageChatRow";

/** Group / supergroup / channel rows show member count instead of last-seen presence. */
export function isGroupLikeChatRow(chat: MessageChatRowData): boolean {
  const kind = chat.chat_kind;
  if (kind === "group" || kind === "supergroup" || kind === "channel") return true;
  if (kind === "private") return false;
  return chat.peer_user_id == null;
}
