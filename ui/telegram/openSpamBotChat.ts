import { buildApiUrl } from "../../api/_base";
import { openAuthenticatedHomeChatHistory } from "../authenticatedHomeSelectedChat";
import type { MessageChatRowData, MessageChatKind } from "../components/messages/MessageChatRow";
import { openMessageLinkUrl } from "../components/messages/openMessageLinkUrl";

function normalizeResolvedChat(raw: unknown): MessageChatRowData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const telegramChatId = Number(row.telegram_chat_id);
  if (!Number.isFinite(telegramChatId)) return null;

  const chatKindRaw = row.chat_kind;
  const chatKind: MessageChatKind | null =
    chatKindRaw === "private" ||
    chatKindRaw === "group" ||
    chatKindRaw === "supergroup" ||
    chatKindRaw === "channel"
      ? chatKindRaw
      : null;

  return {
    id: Number.isFinite(Number(row.id)) ? Number(row.id) : telegramChatId,
    telegram_chat_id: telegramChatId,
    title: typeof row.title === "string" ? row.title : "SpamBot",
    subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    last_message_at:
      typeof row.last_message_at === "string" || typeof row.last_message_at === "number"
        ? String(row.last_message_at)
        : null,
    unread_count: Number.isFinite(Number(row.unread_count)) ? Number(row.unread_count) : 0,
    peer_user_id: Number.isFinite(Number(row.peer_user_id)) ? Number(row.peer_user_id) : null,
    peer_username:
      typeof row.peer_username === "string" && row.peer_username.trim()
        ? row.peer_username.trim().replace(/^@+/, "")
        : "SpamBot",
    chat_username:
      typeof row.chat_username === "string" && row.chat_username.trim()
        ? row.chat_username.trim().replace(/^@+/, "")
        : "SpamBot",
    chat_kind: chatKind,
    member_count: null,
    presence_kind: null,
    presence_at: null,
    chat_action: null,
    chat_action_user_id: null,
    chat_action_user_name: null,
    chat_action_expires_at: null,
    is_pinned: false,
    last_read_outbox_message_id: null,
  };
}

/** Open @SpamBot in-app when possible; otherwise fall back to t.me. */
export async function openSpamBotChat(): Promise<void> {
  try {
    const response = await fetch(
      buildApiUrl("/api/telegram-messages-resolve-chat?username=SpamBot"),
      { credentials: "include" },
    );
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      chat?: unknown;
    };
    if (response.ok && json.ok && json.chat) {
      const chat = normalizeResolvedChat(json.chat);
      if (chat) {
        openAuthenticatedHomeChatHistory(chat);
        return;
      }
    }
  } catch {
    /* fall through to external link */
  }
  openMessageLinkUrl("https://t.me/SpamBot");
}
