import type { MessageChatRowData } from "./MessageChatRow";
import { isSavedMessagesPeer } from "../../../shared/savedMessages";

export function chatIsSavedMessages(
  chat: Pick<MessageChatRowData, "is_saved_messages" | "peer_user_id"> | null | undefined,
  selfUserId?: number | null,
): boolean {
  if (!chat) return false;
  if (chat.is_saved_messages) return true;
  return isSavedMessagesPeer(chat.peer_user_id, selfUserId);
}
