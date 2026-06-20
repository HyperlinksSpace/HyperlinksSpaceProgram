export type MessageChatContentKind =
  | "text"
  | "photo"
  | "video"
  | "document"
  | "animation"
  | "sticker"
  | "other";

export type MessageChatKind =
  | "private"
  | "group"
  | "supergroup"
  | "channel";

export type MessageChatHistoryItem = {
  telegram_message_id: number;
  text: string;
  sent_at: string;
  sender_name: string;
  sender_user_id: number | null;
  sender_chat_id?: number | null;
  sender_is_channel?: boolean;
  is_outgoing: boolean;
  content_kind?: MessageChatContentKind;
  has_media?: boolean;
};

export function isGroupLikeChatKind(kind: MessageChatKind | null | undefined): boolean {
  return kind === "group" || kind === "supergroup" || kind === "channel";
}
