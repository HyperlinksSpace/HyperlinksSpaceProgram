import type { FormattedTextSegment } from "../../../shared/formattedTextSegments";

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
  text_segments?: FormattedTextSegment[] | null;
};

/** Outgoing message delivery state for bubble checkmarks. */
export type MessageOutgoingStatus = "pending" | "delivered" | "read" | "failed";

export type MessageChatHistoryItem = {
  telegram_message_id: number;
  text: string;
  text_segments?: FormattedTextSegment[] | null;
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

/** Outgoing ticks: TDLib may briefly report `pending` after send; show delivered in UI. */
export function coalesceOutgoingStatus(
  raw: unknown,
  isOutgoing: boolean,
): MessageOutgoingStatus | null {
  if (!isOutgoing) return null;
  if (raw === "failed") return "failed";
  if (raw === "read") return "read";
  return "delivered";
}

export function resolveMessageOutgoingStatus(
  item: Pick<MessageChatHistoryItem, "is_outgoing" | "outgoing_status">,
): MessageOutgoingStatus | null {
  return coalesceOutgoingStatus(item.outgoing_status, item.is_outgoing);
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
  const patched =
    Number.isFinite(cursor) && cursor > 0
      ? items.map((item) => patchOutgoingStatusWithReadOutbox(item, cursor))
      : items;
  return applyCumulativeOutgoingReadStatuses(patched);
}

/** If any outgoing message is read, all older outgoing in the batch are read too. */
export function applyCumulativeOutgoingReadStatuses(
  items: MessageChatHistoryItem[],
): MessageChatHistoryItem[] {
  let maxReadId: number | null = null;
  for (const item of items) {
    if (!item.is_outgoing || item.outgoing_status !== "read") continue;
    const id = item.telegram_message_id;
    if (maxReadId == null || id > maxReadId) maxReadId = id;
  }
  if (maxReadId == null) return items;
  return items.map((item) => {
    if (!item.is_outgoing) return item;
    if (item.outgoing_status === "pending" || item.outgoing_status === "failed") return item;
    if (item.telegram_message_id <= maxReadId) {
      return { ...item, outgoing_status: "read" };
    }
    return item;
  });
}

export function isGroupLikeChatKind(kind: MessageChatKind | null | undefined): boolean {
  return kind === "group" || kind === "supergroup" || kind === "channel";
}

const DISPLAYABLE_MEDIA_KINDS = new Set<MessageChatContentKind>([
  "photo",
  "video",
  "animation",
  "sticker",
]);

/** Matches TDLib preview labels from {@link previewFromMessage} for bare media rows. */
const MEDIA_PREVIEW_LABEL_TO_KIND: Record<string, MessageChatContentKind> = {
  Photo: "photo",
  Video: "video",
  GIF: "animation",
  Sticker: "sticker",
};

const GENERIC_BODY_TEXT_LABEL = "Message";

function isPlaceholderBodyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed === GENERIC_BODY_TEXT_LABEL) return true;
  return MEDIA_PREVIEW_LABEL_TO_KIND[trimmed] != null;
}

function mergeTextFields(
  preferred: MessageChatHistoryItem,
  fallback: MessageChatHistoryItem,
): MessageChatHistoryItem {
  const preferredText = preferred.text.trim();
  const fallbackText = fallback.text.trim();
  const preferredOk = !isPlaceholderBodyText(preferredText);
  const fallbackOk = !isPlaceholderBodyText(fallbackText);
  if (preferredOk) return preferred;
  if (fallbackOk) return { ...preferred, text: fallback.text };
  if (preferredText === GENERIC_BODY_TEXT_LABEL) {
    return { ...preferred, text: "" };
  }
  return preferred;
}

function mediaPlaceholderLabel(kind: MessageChatContentKind): string | null {
  if (kind === "photo") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "animation") return "GIF";
  if (kind === "sticker") return "Sticker";
  return null;
}

export function isDisplayableMediaContentKind(
  kind: MessageChatContentKind | null | undefined,
): boolean {
  return kind != null && DISPLAYABLE_MEDIA_KINDS.has(kind);
}

export function isDisplayableMediaMessage(
  item: Pick<MessageChatHistoryItem, "has_media" | "content_kind">,
): boolean {
  return Boolean(item.has_media) && isDisplayableMediaContentKind(item.content_kind);
}

/**
 * Backfill media metadata for history rows that only carry preview text (e.g. "Video", "GIF")
 * so older pages render with the same bare-media layout as freshly mapped messages.
 */
export function enrichHistoryMessageDisplay(item: MessageChatHistoryItem): MessageChatHistoryItem {
  let contentKind = item.content_kind;
  let hasMedia = Boolean(item.has_media);
  let text = item.text;

  if (!isDisplayableMediaContentKind(contentKind)) {
    const trimmed = text.trim();
    const inferred = MEDIA_PREVIEW_LABEL_TO_KIND[trimmed];
    if (inferred) {
      contentKind = inferred;
      hasMedia = true;
      text = "";
    }
  }

  if (isDisplayableMediaContentKind(contentKind)) {
    hasMedia = true;
    const placeholder = mediaPlaceholderLabel(contentKind);
    if (placeholder && text.trim() === placeholder) {
      text = "";
    }
  }

  if (text.trim() === GENERIC_BODY_TEXT_LABEL) {
    text = "";
  }

  if (
    contentKind === item.content_kind &&
    hasMedia === Boolean(item.has_media) &&
    text === item.text
  ) {
    return item;
  }

  return {
    ...item,
    content_kind: contentKind ?? item.content_kind,
    has_media: hasMedia,
    text,
  };
}

function mergeMediaFields(
  preferred: MessageChatHistoryItem,
  fallback: MessageChatHistoryItem,
): MessageChatHistoryItem {
  const preferredMedia = isDisplayableMediaMessage(preferred);
  const fallbackMedia = isDisplayableMediaMessage(fallback);
  if (preferredMedia) return preferred;
  if (!fallbackMedia) return preferred;

  const enrichedFallback = enrichHistoryMessageDisplay(fallback);
  return {
    ...preferred,
    content_kind: enrichedFallback.content_kind,
    has_media: enrichedFallback.has_media,
    text: enrichedFallback.text.trim() ? preferred.text : enrichedFallback.text,
    media_width: preferred.media_width ?? enrichedFallback.media_width ?? null,
    media_height: preferred.media_height ?? enrichedFallback.media_height ?? null,
  };
}

/** Merge two rows for the same telegram_message_id, keeping the richest media metadata. */
export function mergeHistoryMessageRow(
  prev: MessageChatHistoryItem | undefined,
  incoming: MessageChatHistoryItem,
): MessageChatHistoryItem {
  const incomingEnriched = enrichHistoryMessageDisplay(incoming);
  if (!prev) return incomingEnriched;

  const prevEnriched = enrichHistoryMessageDisplay(prev);
  let outgoingStatus = incomingEnriched.outgoing_status;
  if (
    prevEnriched.is_outgoing &&
    prevEnriched.outgoing_status === "read" &&
    incomingEnriched.outgoing_status === "delivered"
  ) {
    outgoingStatus = "read";
  }

  return enrichHistoryMessageDisplay({
    ...mergeTextFields(mergeMediaFields(incomingEnriched, prevEnriched), prevEnriched),
    text_segments: incomingEnriched.text_segments ?? prevEnriched.text_segments ?? null,
    outgoing_status: outgoingStatus,
  });
}
