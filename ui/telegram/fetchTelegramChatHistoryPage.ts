import { Platform } from "react-native";
import { buildApiUrl } from "../../api/_base";
import { normalizeFormattedTextSegments } from "../../shared/formattedTextSegments";
import { safeTelegramUserIdForLog } from "../../shared/appLog";
import { normalizeMappedReplyMarkup } from "../../telegram/tdlib/replyMarkupMap";
import type {
  MessageChatAudioPayload,
  MessageChatContentKind,
  MessageChatHistoryItem,
  MessageChatKind,
  MessageChatWebPagePreview,
} from "../components/messages/messageChatHistoryTypes";
import {
  coalesceOutgoingStatus,
  enrichHistoryMessageDisplay,
  resolveHistoryMessageIsOutgoing,
} from "../components/messages/messageChatHistoryTypes";
import { MESSAGE_CHAT_HISTORY_PAGE_SIZE } from "../components/messages/messageChatLayout";
import { isVoiceDialogUiOpen } from "../components/messages/voiceDialogUiGate";
import { warmupTelegramChatSession } from "./warmupTelegramChatSession";
import { logPageDisplay } from "../pageDisplayLog";
import {
  isOnMessagesChatPath,
  waitForIosCompactHistoryFetchReady,
} from "../compactChatRouteGate";
import { isIosTelegramMiniAppSync } from "../components/telegramWebApp";
import { abortIosCompetingReads, openIosCompetingRead } from "./iosCompetingRead";
import {
  fetchHistoryBodyInWorker,
  historyFetchWorkerSupported,
} from "./historyFetchWorkerClient";

function isWebHistoryPlatform(): boolean {
  return Platform.OS === "web";
}

export type ChatHistoryPageResult = {
  messages: MessageChatHistoryItem[];
  chatKind: MessageChatKind | null;
  error: string | null;
  hasMoreOlder: boolean;
  nextBeforeMessageId: number | null;
  lastReadOutboxMessageId: number | null;
  lastReadInboxMessageId: number | null;
  memberCount: number | null;
  selfUserId: number | null;
};

function normalizeChatKind(raw: unknown): MessageChatKind | null {
  if (
    raw === "private" ||
    raw === "group" ||
    raw === "supergroup" ||
    raw === "channel"
  ) {
    return raw;
  }
  return null;
}

function parseHistoryAudio(raw: unknown): MessageChatAudioPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const artist = typeof row.artist === "string" ? row.artist : "";
  const title = typeof row.title === "string" ? row.title : "";
  const duration = Number(row.duration_sec ?? row.durationSec);
  const size = Number(row.size_bytes ?? row.sizeBytes);
  const cover =
    typeof row.cover_data_url === "string" && row.cover_data_url.trim()
      ? row.cover_data_url.trim()
      : typeof row.coverDataUrl === "string" && row.coverDataUrl.trim()
        ? row.coverDataUrl.trim()
        : null;
  if (!artist && !title && !(Number.isFinite(duration) && duration > 0)) return null;
  return {
    artist,
    title,
    duration_sec: Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 0,
    size_bytes: Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0,
    cover_data_url: cover,
  };
}

function parseHistoryWebPage(raw: unknown): MessageChatWebPagePreview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const url =
    (typeof row.url === "string" && row.url.trim()) ||
    (typeof row.display_url === "string" && row.display_url.trim()) ||
    (typeof row.displayUrl === "string" && row.displayUrl.trim()) ||
    "";
  if (!url) return null;
  const photo =
    (typeof row.photo_minithumbnail_data_url === "string" &&
      row.photo_minithumbnail_data_url.trim()) ||
    (typeof row.photoMinithumbnailDataUrl === "string" &&
      row.photoMinithumbnailDataUrl.trim()) ||
    null;
  return {
    url,
    display_url:
      typeof row.display_url === "string" && row.display_url.trim()
        ? row.display_url.trim()
        : typeof row.displayUrl === "string" && row.displayUrl.trim()
          ? row.displayUrl.trim()
          : null,
    site_name:
      typeof row.site_name === "string" && row.site_name.trim()
        ? row.site_name.trim()
        : typeof row.siteName === "string" && row.siteName.trim()
          ? row.siteName.trim()
          : null,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : null,
    description:
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
    photo_minithumbnail_data_url: photo,
  };
}

export function normalizeHistoryMessage(
  raw: unknown,
  peerUserId: number | null | undefined,
  selfUserId: number | null | undefined,
): MessageChatHistoryItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const telegramMessageId = Number(row.telegram_message_id);
  if (!Number.isFinite(telegramMessageId)) return null;
  const text = typeof row.text === "string" ? row.text : "";
  const hasMedia = Boolean(row.has_media ?? row.hasMedia);
  const contentKindRaw = row.content_kind ?? row.contentKind;
  const contentKind =
    contentKindRaw === "text" ||
    contentKindRaw === "photo" ||
    contentKindRaw === "video" ||
    contentKindRaw === "document" ||
    contentKindRaw === "animation" ||
    contentKindRaw === "sticker" ||
    contentKindRaw === "audio" ||
    contentKindRaw === "call" ||
    contentKindRaw === "service" ||
    contentKindRaw === "other"
      ? (contentKindRaw as MessageChatContentKind)
      : undefined;
  const isCall = contentKind === "call";
  const isAudio = contentKind === "audio";
  const isService = contentKind === "service";
  if (!text.trim() && !hasMedia && !isCall && !isAudio && !isService) return null;
  const senderUserId = Number(row.sender_user_id);
  const senderChatId = Number(row.sender_chat_id);
  const safeSenderUserId = safeTelegramUserIdForLog(senderUserId) ?? null;
  const rawOutgoing = row.is_outgoing ?? row.isOutgoing;
  const isOutgoing = resolveHistoryMessageIsOutgoing({
    rawIsOutgoing: rawOutgoing,
    senderUserId: safeSenderUserId,
    peerUserId,
    selfUserId,
  });
  const outgoingRaw = row.outgoing_status ?? row.outgoingStatus;
  const outgoingStatus = coalesceOutgoingStatus(outgoingRaw, isOutgoing);
  let replyTo: MessageChatHistoryItem["reply_to"] = null;
  let replyToMessageId: number | null = null;
  const replyIdRaw = Number(row.reply_to_message_id ?? row.replyToMessageId);
  if (Number.isFinite(replyIdRaw) && replyIdRaw > 0) {
    replyToMessageId = Math.trunc(replyIdRaw);
  }
  const replyRaw = row.reply_to;
  if (replyRaw && typeof replyRaw === "object" && !Array.isArray(replyRaw)) {
    const replyRow = replyRaw as Record<string, unknown>;
    const replySenderName =
      typeof replyRow.sender_name === "string" ? replyRow.sender_name.trim() : "";
    const replyText = typeof replyRow.text === "string" ? replyRow.text.trim() : "";
    if (replyText) {
      const replySenderUserId = Number(replyRow.sender_user_id);
      replyTo = {
        sender_name: replySenderName || "…",
        sender_user_id: safeTelegramUserIdForLog(replySenderUserId) ?? null,
        text: replyText,
        text_segments: normalizeFormattedTextSegments(replyRow.text_segments),
        sender_emoji_status_custom_emoji_id:
          typeof replyRow.sender_emoji_status_custom_emoji_id === "string" &&
          replyRow.sender_emoji_status_custom_emoji_id.trim()
            ? replyRow.sender_emoji_status_custom_emoji_id.trim()
            : null,
        sender_accent_color_light:
          typeof replyRow.sender_accent_color_light === "string" &&
          replyRow.sender_accent_color_light.trim()
            ? replyRow.sender_accent_color_light.trim()
            : null,
        sender_accent_color_dark:
          typeof replyRow.sender_accent_color_dark === "string" &&
          replyRow.sender_accent_color_dark.trim()
            ? replyRow.sender_accent_color_dark.trim()
            : null,
        thumbnail_data_url:
          typeof replyRow.thumbnail_data_url === "string" &&
          replyRow.thumbnail_data_url.trim()
            ? replyRow.thumbnail_data_url.trim()
            : typeof replyRow.thumbnailDataUrl === "string" &&
                replyRow.thumbnailDataUrl.trim()
              ? replyRow.thumbnailDataUrl.trim()
              : null,
      };
    }
  }
  return enrichHistoryMessageDisplay({
    telegram_message_id: telegramMessageId,
    text,
    text_segments: normalizeFormattedTextSegments(row.text_segments),
    sent_at: typeof row.sent_at === "string" ? row.sent_at : "",
    sender_name: typeof row.sender_name === "string" ? row.sender_name : "",
    sender_user_id: safeSenderUserId,
    sender_chat_id: Number.isFinite(senderChatId) ? senderChatId : null,
    sender_is_channel: Boolean(row.sender_is_channel),
    sender_author_signature:
      typeof row.sender_author_signature === "string" && row.sender_author_signature.trim()
        ? row.sender_author_signature.trim()
        : null,
    sender_emoji_status_custom_emoji_id:
      typeof row.sender_emoji_status_custom_emoji_id === "string" &&
      row.sender_emoji_status_custom_emoji_id.trim()
        ? row.sender_emoji_status_custom_emoji_id.trim()
        : null,
    sender_accent_color_light:
      typeof row.sender_accent_color_light === "string" && row.sender_accent_color_light.trim()
        ? row.sender_accent_color_light.trim()
        : null,
    sender_accent_color_dark:
      typeof row.sender_accent_color_dark === "string" && row.sender_accent_color_dark.trim()
        ? row.sender_accent_color_dark.trim()
        : null,
    is_outgoing: isOutgoing,
    outgoing_status: outgoingStatus,
    content_kind: contentKind,
    has_media: hasMedia,
    media_width: Number.isFinite(Number(row.media_width ?? row.mediaWidth))
      ? Number(row.media_width ?? row.mediaWidth)
      : null,
    media_height: Number.isFinite(Number(row.media_height ?? row.mediaHeight))
      ? Number(row.media_height ?? row.mediaHeight)
      : null,
    reply_to: replyTo,
    reply_to_message_id: replyToMessageId,
    web_page: parseHistoryWebPage(row.web_page ?? row.webPage),
    call_success: isCall ? Boolean(row.call_success ?? row.callSuccess) : undefined,
    audio: parseHistoryAudio(row.audio),
    reply_markup: normalizeMappedReplyMarkup(row.reply_markup ?? row.replyMarkup),
    service_notice: (() => {
      const rawNotice = row.service_notice ?? row.serviceNotice;
      if (!rawNotice || typeof rawNotice !== "object" || Array.isArray(rawNotice)) {
        return null;
      }
      const notice = rawNotice as Record<string, unknown>;
      const actorName =
        typeof notice.actor_name === "string"
          ? notice.actor_name.trim()
          : typeof notice.actorName === "string"
            ? notice.actorName.trim()
            : "";
      if (!actorName) return null;
      const actorIdRaw = Number(notice.actor_user_id ?? notice.actorUserId);
      return {
        kind: notice.kind === "chat_leave" ? ("chat_leave" as const) : ("chat_join" as const),
        actor_user_id:
          Number.isFinite(actorIdRaw) && actorIdRaw !== 0 ? Math.trunc(actorIdRaw) : null,
        actor_name: actorName,
      };
    })(),
  });
}

export function isTransientHistoryFetchError(error: string | null | undefined): boolean {
  if (!error) return false;
  if (
    error === "session_not_ready" ||
    error === "history_unavailable" ||
    error === "gateway_unreachable" ||
    error === "history_failed" ||
    error === "gateway_timeout_retry" ||
    error === "network_error" ||
    error === "not_found" ||
    /chat not found/i.test(error)
  ) {
    return true;
  }
  return /^HTTP_50[234]$/.test(error);
}

const HISTORY_FETCH_BACKGROUND_TIMEOUT_MS = 8_000;
const HISTORY_FETCH_IOS_FOREGROUND_TIMEOUT_MS = 28_000;

function emptyHistoryError(error: string): ChatHistoryPageResult {
  return {
    messages: [],
    chatKind: null,
    error,
    hasMoreOlder: false,
    nextBeforeMessageId: null,
    lastReadOutboxMessageId: null,
    lastReadInboxMessageId: null,
    memberCount: null,
    selfUserId: null,
  };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HistoryWireJson = {
  ok?: boolean;
  messages?: unknown[];
  chat_kind?: unknown;
  member_count?: unknown;
  has_more_older?: boolean;
  next_before_message_id?: number;
  last_read_outbox_message_id?: number;
  last_read_inbox_message_id?: number;
  self_user_id?: number;
  error?: string;
};

type WebHistoryPaintListener = (chatId: number, page: ChatHistoryPageResult) => void;
let webHistoryPaintListener: WebHistoryPaintListener | null = null;

/** Web: commit an open history page from the worker message turn into the list. */
export function setWebHistoryPaint(listener: WebHistoryPaintListener | null): void {
  webHistoryPaintListener = listener;
}

/** @deprecated Use {@link setWebHistoryPaint} */
export function setIosHistoryPaint(listener: WebHistoryPaintListener | null): void {
  setWebHistoryPaint(listener);
}

async function fetchTelegramChatHistoryPageOnce(
  chatId: number,
  limit: number,
  peerUserId: number | null | undefined,
  beforeMessageId?: number | null,
  sinceMessageId?: number | null,
  aroundUnread = false,
  aroundMessageId?: number | null,
  olderAbove?: number | null,
  newerBelow?: number | null,
  options?: { background?: boolean },
): Promise<ChatHistoryPageResult> {
  const params = new URLSearchParams({
    chat_id: String(chatId),
    limit: String(limit),
  });
  if (
    typeof beforeMessageId === "number" &&
    Number.isFinite(beforeMessageId) &&
    beforeMessageId > 0
  ) {
    params.set("before_message_id", String(beforeMessageId));
  }
  if (
    typeof sinceMessageId === "number" &&
    Number.isFinite(sinceMessageId) &&
    sinceMessageId > 0
  ) {
    params.set("since_message_id", String(sinceMessageId));
  }
  if (aroundUnread) {
    params.set("around_unread", "1");
  }
  if (
    typeof aroundMessageId === "number" &&
    Number.isFinite(aroundMessageId) &&
    aroundMessageId > 0
  ) {
    params.set("around_message_id", String(aroundMessageId));
  }
  if (
    typeof olderAbove === "number" &&
    Number.isFinite(olderAbove) &&
    olderAbove >= 0
  ) {
    params.set("older_above", String(Math.trunc(olderAbove)));
  }
  if (
    typeof newerBelow === "number" &&
    Number.isFinite(newerBelow) &&
    newerBelow >= 0
  ) {
    params.set("newer_below", String(Math.trunc(newerBelow)));
  }
  const url = buildApiUrl(`/api/telegram-messages-history?${params.toString()}`);
  const iosOpenForeground =
    isWebHistoryPlatform() &&
    isIosTelegramMiniAppSync() &&
    options?.background !== true;
  if (iosOpenForeground) {
    abortIosCompetingReads();
    // Gesture prime runs on the list host; only waits when this fetch starts on chat.
    if (isOnMessagesChatPath()) {
      await waitForIosCompactHistoryFetchReady();
    }
  }
  // Same request as the home chat list: GET + credentials, then read the body.
  const competing = openIosCompetingRead();
  const onChatPath = isOnMessagesChatPath();
  const iosWorkerPath = iosOpenForeground && historyFetchWorkerSupported();
  const timer =
    options?.background === true
      ? setTimeout(() => competing.abort(), HISTORY_FETCH_BACKGROUND_TIMEOUT_MS)
      : iosOpenForeground && onChatPath && !iosWorkerPath
        ? setTimeout(() => competing.abort(), HISTORY_FETCH_IOS_FOREGROUND_TIMEOUT_MS)
        : null;
  const sentAt = Date.now();
  logPageDisplay("messages_history_fetch_dispatch", {
    chatId,
    limit,
    background: options?.background === true,
    aroundUnread,
    aroundMessageId:
      typeof aroundMessageId === "number" && aroundMessageId > 0
        ? aroundMessageId
        : undefined,
    iosOpenForeground,
    iosWorkerPath,
    onChatPath,
  });
  try {
    logPageDisplay("messages_history_fetch_await", {
      chatId,
      background: options?.background === true,
      iosWorkerPath,
    });
    let httpStatus: number;
    let json: HistoryWireJson;
    if (iosWorkerPath) {
      const workerResult = await fetchHistoryBodyInWorker(
        url,
        HISTORY_FETCH_IOS_FOREGROUND_TIMEOUT_MS,
      );
      httpStatus = workerResult.status;
      logPageDisplay("messages_history_fetch_response", {
        chatId,
        status: httpStatus,
        elapsedMs: Date.now() - sentAt,
        background: options?.background === true,
        worker: true,
      });
      const text = workerResult.text;
      logPageDisplay("messages_history_text_hit", {
        chatId,
        status: httpStatus,
        bytes: text.length,
        background: options?.background === true,
        worker: true,
      });
      try {
        json = text ? (JSON.parse(text) as HistoryWireJson) : {};
      } catch {
        json = {};
      }
    } else {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        signal: competing.signal,
      });
      httpStatus = response.status;
      const contentLengthRaw = response.headers.get("content-length");
      logPageDisplay("messages_history_fetch_response", {
        chatId,
        status: response.status,
        elapsedMs: Date.now() - sentAt,
        background: options?.background === true,
        contentLength: contentLengthRaw ?? undefined,
      });
      if (iosOpenForeground) {
        const text = await response.text();
        logPageDisplay("messages_history_text_hit", {
          chatId,
          status: httpStatus,
          bytes: text.length,
          background: options?.background === true,
        });
        try {
          json = text ? (JSON.parse(text) as HistoryWireJson) : {};
        } catch {
          json = {};
        }
      } else {
        json = (await response.json().catch(() => ({}))) as HistoryWireJson;
      }
    }
    if (competing.signal.aborted) {
      return emptyHistoryError("gateway_timeout_retry");
    }
    logPageDisplay("messages_history_fetch_body", {
      chatId,
      count: Array.isArray(json.messages) ? json.messages.length : 0,
      ok: json.ok === true,
      elapsedMs: Date.now() - sentAt,
      background: options?.background === true,
    });
    if (httpStatus < 200 || httpStatus >= 300 || !json.ok) {
      return emptyHistoryError(json.error || `HTTP_${httpStatus}`);
    }
    // Neighbor history JSON can be huge — normalizing mid-Join freezes WebRTC/Close.
    if (options?.background && isVoiceDialogUiOpen()) {
      return emptyHistoryError("voice_dialog_open");
    }
    const rows: MessageChatHistoryItem[] = [];
    const selfUserRaw = Number(json.self_user_id);
    const selfUserId =
      Number.isFinite(selfUserRaw) && selfUserRaw > 0
        ? safeTelegramUserIdForLog(selfUserRaw) ?? null
        : null;
    if (Array.isArray(json.messages)) {
      for (const raw of json.messages) {
        const row = normalizeHistoryMessage(raw, peerUserId, selfUserId);
        if (row) rows.push(row);
      }
    }
    const lastReadRaw = Number(json.last_read_outbox_message_id);
    const lastReadInboxRaw = Number(json.last_read_inbox_message_id);
    const memberRaw = Number(json.member_count);
    const page: ChatHistoryPageResult = {
      messages: rows,
      chatKind: normalizeChatKind(json.chat_kind),
      error: null,
      hasMoreOlder: Boolean(json.has_more_older),
      nextBeforeMessageId:
        typeof json.next_before_message_id === "number" &&
        Number.isFinite(json.next_before_message_id) &&
        json.next_before_message_id > 0
          ? json.next_before_message_id
          : null,
      lastReadOutboxMessageId:
        Number.isFinite(lastReadRaw) && lastReadRaw > 0 ? lastReadRaw : null,
      lastReadInboxMessageId:
        Number.isFinite(lastReadInboxRaw) && lastReadInboxRaw > 0
          ? lastReadInboxRaw
          : null,
      memberCount:
        Number.isFinite(memberRaw) && memberRaw > 0 ? Math.trunc(memberRaw) : null,
      selfUserId,
    };
    return page;
  } catch (err) {
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      competing.signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    if (isWebHistoryPlatform()) {
      logPageDisplay("messages_history_web_fetch_error", {
        chatId,
        message: aborted ? "aborted" : message,
      });
    }
    return emptyHistoryError(aborted ? "gateway_timeout_retry" : "network_error");
  } finally {
    if (timer != null) clearTimeout(timer);
    competing.finish();
  }
}

const HISTORY_FETCH_MAX_ATTEMPTS = 3;
const HISTORY_FETCH_RETRY_BASE_MS = 400;

const foregroundHistoryFlights = new Map<string, Promise<ChatHistoryPageResult>>();

/** Drop a foreground history promise the WebView never delivered, so the next open can fetch. */
export function abandonForegroundHistoryFlightsForChat(chatId: number): void {
  const prefix = `${Math.trunc(chatId)}:`;
  for (const key of foregroundHistoryFlights.keys()) {
    if (key.startsWith(prefix)) foregroundHistoryFlights.delete(key);
  }
}

function foregroundHistoryFlightKey(
  chatId: number,
  limit: number,
  beforeMessageId?: number | null,
  sinceMessageId?: number | null,
  aroundUnread = false,
  aroundMessageId?: number | null,
): string {
  return [
    chatId,
    limit,
    beforeMessageId ?? "",
    sinceMessageId ?? "",
    aroundUnread ? 1 : 0,
    aroundMessageId ?? "",
  ].join(":");
}

/** Fetch one history page, retrying transient gateway / API failures. */
export async function fetchTelegramChatHistoryPage(
  chatId: number,
  limit: number,
  peerUserId: number | null | undefined,
  beforeMessageId?: number | null,
  sinceMessageId?: number | null,
  aroundUnread = false,
  aroundMessageId?: number | null,
  olderAbove?: number | null,
  newerBelow?: number | null,
  options?: { background?: boolean },
): Promise<ChatHistoryPageResult> {
  if (options?.background !== true) {
    const flightKey = foregroundHistoryFlightKey(
      chatId,
      limit,
      beforeMessageId,
      sinceMessageId,
      aroundUnread,
      aroundMessageId,
    );
    const existing = foregroundHistoryFlights.get(flightKey);
    if (existing) return existing;
    const flight = fetchTelegramChatHistoryPageBody(
      chatId,
      limit,
      peerUserId,
      beforeMessageId,
      sinceMessageId,
      aroundUnread,
      aroundMessageId,
      olderAbove,
      newerBelow,
      options,
    ).finally(() => {
      if (foregroundHistoryFlights.get(flightKey) === flight) {
        foregroundHistoryFlights.delete(flightKey);
      }
    });
    foregroundHistoryFlights.set(flightKey, flight);
    return flight;
  }
  return fetchTelegramChatHistoryPageBody(
    chatId,
    limit,
    peerUserId,
    beforeMessageId,
    sinceMessageId,
    aroundUnread,
    aroundMessageId,
    olderAbove,
    newerBelow,
    options,
  );
}

async function fetchTelegramChatHistoryPageBody(
  chatId: number,
  limit: number,
  peerUserId: number | null | undefined,
  beforeMessageId?: number | null,
  sinceMessageId?: number | null,
  aroundUnread = false,
  aroundMessageId?: number | null,
  olderAbove?: number | null,
  newerBelow?: number | null,
  options?: { background?: boolean },
): Promise<ChatHistoryPageResult> {
  let lastResult: ChatHistoryPageResult | null = null;
  for (let attempt = 0; attempt < HISTORY_FETCH_MAX_ATTEMPTS; attempt += 1) {
    const result = await fetchTelegramChatHistoryPageOnce(
      chatId,
      limit,
      peerUserId,
      beforeMessageId,
      sinceMessageId,
      aroundUnread,
      aroundMessageId,
      olderAbove,
      newerBelow,
      options,
    );
    if (!result.error) return result;
    lastResult = result;
    if (
      !isTransientHistoryFetchError(result.error) ||
      // The aborted request is still running on the gateway. A second call
      // queues behind it and the spinner never reads a body.
      result.error === "gateway_timeout_retry" ||
      attempt >= HISTORY_FETCH_MAX_ATTEMPTS - 1
    ) {
      return result;
    }
    await sleepMs(HISTORY_FETCH_RETRY_BASE_MS * (attempt + 1));
  }
  return (
    lastResult ?? {
      messages: [],
      chatKind: null,
      error: "history_unavailable",
      hasMoreOlder: false,
      nextBeforeMessageId: null,
      lastReadOutboxMessageId: null,
      lastReadInboxMessageId: null,
      memberCount: null,
      selfUserId: null,
    }
  );
}

/** First history page with optional gateway warmup retry. */
export async function loadTelegramChatHistoryFirstPage(
  chatId: number,
  peerUserId: number | null | undefined,
  options?: {
    warmup?: boolean;
    limit?: number;
    aroundUnread?: boolean;
    aroundMessageId?: number | null;
    olderAbove?: number | null;
    newerBelow?: number | null;
    background?: boolean;
  },
): Promise<ChatHistoryPageResult> {
  // Warmup is a second in-flight body. On iOS that body lands while history
  // is open and the WebView stops resuming the history read.
  const warmup =
    options?.warmup !== false &&
    !(isWebHistoryPlatform() && options?.background !== true);
  const aroundUnread = options?.aroundUnread === true;
  const aroundMessageId = options?.aroundMessageId ?? null;
  const olderAbove = options?.olderAbove ?? null;
  const newerBelow = options?.newerBelow ?? null;
  const background = options?.background === true;
  const limit =
    typeof options?.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.trunc(options.limit)
      : MESSAGE_CHAT_HISTORY_PAGE_SIZE;
  const warmupPromise = warmup ? warmupTelegramChatSession(chatId) : Promise.resolve();
  const fetchArgs = [
    chatId,
    limit,
    peerUserId,
    null,
    null,
    aroundUnread,
    aroundMessageId,
    olderAbove,
    newerBelow,
    { background },
  ] as const;
  let result = await fetchTelegramChatHistoryPage(...fetchArgs);
  if (
    result.error === "session_not_ready" ||
    result.error === "history_unavailable" ||
    result.error === "not_found" ||
    (typeof result.error === "string" && /chat not found/i.test(result.error))
  ) {
    await warmupPromise;
    result = await fetchTelegramChatHistoryPage(...fetchArgs);
  }
  return result;
}

/** Live tail sync — only messages newer than sinceMessageId. */
export async function fetchTelegramChatHistorySince(
  chatId: number,
  sinceMessageId: number,
  limit: number,
  peerUserId: number | null | undefined,
): Promise<ChatHistoryPageResult> {
  return fetchTelegramChatHistoryPage(chatId, limit, peerUserId, null, sinceMessageId);
}
