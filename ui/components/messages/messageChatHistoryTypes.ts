export type MessageChatContentKind =
  | "text"
  | "photo"
  | "video"
  | "document"
  | "animation"
  | "sticker"
  | "call"
  | "other";

export type MessageChatKind =
  | "private"
  | "group"
  | "supergroup"
  | "channel";

export type MessageChatReplyPreview = {
  sender_name: string;
  sender_user_id: number | null;
  text: string;
};

/** Outgoing message delivery state for bubble checkmarks. */
export type MessageOutgoingStatus = "pending" | "delivered" | "read" | "failed";

export type MessageChatHistoryItem = {
  telegram_message_id: number;
  text: string;
  sent_at: string;
  sender_name: string;
  sender_user_id: number | null;
  sender_chat_id?: number | null;
  sender_is_channel?: boolean;
  is_outgoing: boolean;
  /** Outgoing delivery/read ticks (private chats use read receipts). */
  outgoing_status?: MessageOutgoingStatus | null;
  content_kind?: MessageChatContentKind;
  has_media?: boolean;
  media_width?: number | null;
  media_height?: number | null;
  reply_to?: MessageChatReplyPreview | null;
  /** Ended call was answered / had duration (content_kind call). */
  call_success?: boolean | null;
};

export function resolveMessageOutgoingStatus(
  item: Pick<MessageChatHistoryItem, "is_outgoing" | "outgoing_status">,
): MessageOutgoingStatus | null {
  if (!item.is_outgoing) return null;
  const status = item.outgoing_status;
  if (status === "pending" || status === "delivered" || status === "read" || status === "failed") {
    return status;
  }
  return "delivered";
}

/** Highest known private-chat read cursor (outgoing messages with id <= cursor are read). */
export function effectiveReadOutboxMessageId(
  ...candidates: Array<number | null | undefined>
): number | null {
  let max: number | null = null;
  for (const raw of candidates) {
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0 && (max == null || id > max)) {
      max = id;
    }
  }
  return max;
}

export function maxReadOutboxMessageIdFromItems(
  items: Array<Pick<MessageChatHistoryItem, "is_outgoing" | "outgoing_status" | "telegram_message_id">>,
): number | null {
  let max: number | null = null;
  for (const item of items) {
    if (!item.is_outgoing || item.outgoing_status !== "read") continue;
    const id = Number(item.telegram_message_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (max == null || id > max) max = id;
  }
  return max;
}

export function patchOutgoingStatusWithReadOutbox(
  item: MessageChatHistoryItem,
  lastReadOutboxMessageId: number | null | undefined,
): MessageChatHistoryItem {
  if (!item.is_outgoing) return item;
  if (item.outgoing_status === "pending" || item.outgoing_status === "failed") return item;
  if (item.outgoing_status === "read") return item;
  const cursor = Number(lastReadOutboxMessageId);
  if (!Number.isFinite(cursor) || cursor <= 0) return item;
  if (item.telegram_message_id <= cursor) {
    return { ...item, outgoing_status: "read" };
  }
  return item;
}

export function patchOutgoingStatusesWithReadOutbox(
  items: MessageChatHistoryItem[],
  lastReadOutboxMessageId: number | null | undefined,
): MessageChatHistoryItem[] {
  const cursor = Number(lastReadOutboxMessageId);
  if (!Number.isFinite(cursor) || cursor <= 0) return items;
  return items.map((item) => patchOutgoingStatusWithReadOutbox(item, cursor));
}

export function isGroupLikeChatKind(kind: MessageChatKind | null | undefined): boolean {
  return kind === "group" || kind === "supergroup" || kind === "channel";
}
