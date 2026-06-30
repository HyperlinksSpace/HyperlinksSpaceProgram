import type { MessageChatRowData } from "./MessageChatRow";

export function resolveMessageChatRowUsername(
  chat: Pick<MessageChatRowData, "peer_username" | "chat_username" | "peer_user_id">,
): string | null {
  if (chat.peer_user_id != null) return chat.peer_username ?? null;
  return chat.chat_username ?? null;
}

export function formatTelegramUsernameAt(username: string | null | undefined): string | null {
  if (typeof username !== "string") return null;
  const trimmed = username.trim().replace(/^@+/, "");
  return trimmed.length > 0 ? `@${trimmed}` : null;
}

/** Hide @username when the title already is the handle. */
export function shouldShowChatRowUsername(title: string, username: string | null): boolean {
  if (!username) return false;
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return true;
  const at = `@${username}`;
  if (trimmedTitle.toLowerCase() === at.toLowerCase()) return false;
  if (trimmedTitle.toLowerCase() === username.toLowerCase()) return false;
  return true;
}

export function formatMessageChatRowUsernameLabel(chat: MessageChatRowData): string | null {
  const username = resolveMessageChatRowUsername(chat);
  if (!shouldShowChatRowUsername(chat.title, username)) return null;
  return formatTelegramUsernameAt(username);
}
