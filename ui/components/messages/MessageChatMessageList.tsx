import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from "react-native";
import { buildApiUrl } from "../../../api/_base";
import { normalizeFormattedTextSegments } from "../../../shared/formattedTextSegments";
import { safeTelegramUserIdForLog } from "../../../shared/appLog";
import { useAuth } from "../../../auth/AuthContext";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { useAuthenticatedHomeHistoryLoadTarget } from "../../authenticatedHomeSelectedChat";
import { chatLogFields, logPageDisplay } from "../../pageDisplayLog";
import { subscribeOutgoingChatMessages } from "../../messageChatOutgoing";
import { layout, type ThemeColors } from "../../theme";
import { useTelegramMessagesConnection } from "../../telegram/TelegramMessagesConnectionContext";
import { warmupTelegramChatSession } from "../../telegram/warmupTelegramChatSession";
import { HspScrollColumn, type HspScrollAnchor, type HspScrollColumnHandle } from "../HspScrollColumn";
import {
  MESSAGE_BUBBLE_ROW_GAP_PX,
  MESSAGE_CHAT_BODY_PADDING_PX,
  MESSAGE_CHAT_HISTORY_PAGE_SIZE,
  MESSAGE_CHAT_LOAD_OLDER_THRESHOLD_PX,
} from "./messageChatLayout";
import type {
  MessageChatContentKind,
  MessageChatHistoryItem,
  MessageChatKind,
} from "./messageChatHistoryTypes";
import { patchAuthenticatedHomeSelectedChatReadOutbox, patchAuthenticatedHomeSelectedChatGroupMeta } from "../../authenticatedHomeSelectedChat";
import {
  coalesceOutgoingStatus,
  effectiveReadOutboxMessageId as mergeReadOutboxCursor,
  enrichHistoryMessageDisplay,
  maxReadOutboxMessageIdFromItems,
  mergeHistoryMessageRow,
  patchOutgoingStatusesWithReadOutbox,
  resolveHistoryMessageIsOutgoing,
  type HistoryMessageContext,
} from "./messageChatHistoryTypes";
import { MessageChatMessageRow } from "./MessageChatMessageRow";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

const MESSAGE_CHAT_LIVE_POLL_MS = 3_000;
const MESSAGE_CHAT_LIVE_POLL_STREAM_FALLBACK_MS = 30_000;
const CHAT_HISTORY_STREAM_ENABLED = typeof EventSource !== "undefined";

function chatLiveSignature(chat: MessageChatRowData): string {
  return [
    chat.last_message_at ?? "",
    chat.subtitle,
    chat.unread_count,
    chat.last_read_outbox_message_id ?? "",
    chat.chat_action ?? "",
    chat.chat_action_expires_at ?? "",
    chat.presence_kind ?? "",
  ].join("|");
}

function normalizeHistoryMessage(
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
    contentKindRaw === "call" ||
    contentKindRaw === "other"
      ? (contentKindRaw as MessageChatContentKind)
      : undefined;
  const isCall = contentKind === "call";
  if (!text.trim() && !hasMedia && !isCall) return null;
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
  const replyRaw = row.reply_to;
  if (replyRaw && typeof replyRaw === "object" && !Array.isArray(replyRaw)) {
    const replyRow = replyRaw as Record<string, unknown>;
    const replySenderName =
      typeof replyRow.sender_name === "string" ? replyRow.sender_name.trim() : "";
    const replyText = typeof replyRow.text === "string" ? replyRow.text.trim() : "";
    if (replySenderName && replyText) {
      const replySenderUserId = Number(replyRow.sender_user_id);
      replyTo = {
        sender_name: replySenderName,
        sender_user_id: safeTelegramUserIdForLog(replySenderUserId) ?? null,
        text: replyText,
        text_segments: normalizeFormattedTextSegments(replyRow.text_segments),
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
    call_success: isCall ? Boolean(row.call_success ?? row.callSuccess) : undefined,
  });
}

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

function collapseOutgoingEchoDuplicates(
  items: MessageChatHistoryItem[],
  ctx?: HistoryMessageContext,
): MessageChatHistoryItem[] {
  const result: MessageChatHistoryItem[] = [];
  for (const item of items) {
    if (!item.is_outgoing) {
      result.push(item);
      continue;
    }
    const textKey = item.text.trim();
    const sentAt = Date.parse(item.sent_at);
    const dupIdx = result.findIndex((row) => {
      if (!row.is_outgoing || row.telegram_message_id === item.telegram_message_id) return false;
      if (row.text.trim() !== textKey) return false;
      const rowSent = Date.parse(row.sent_at);
      if (!Number.isFinite(sentAt) || !Number.isFinite(rowSent)) return true;
      return Math.abs(sentAt - rowSent) < 60_000;
    });
    if (dupIdx >= 0) {
      result[dupIdx] = mergeHistoryMessageRow(result[dupIdx]!, item, ctx);
      continue;
    }
    result.push(item);
  }
  return result;
}

function mergeHistoryMessages(
  existing: MessageChatHistoryItem[],
  incoming: MessageChatHistoryItem[],
  ctx?: HistoryMessageContext,
): MessageChatHistoryItem[] {
  const byId = new Map<number, MessageChatHistoryItem>();
  for (const row of existing) {
    byId.set(row.telegram_message_id, enrichHistoryMessageDisplay(row));
  }
  for (const row of incoming) {
    const prev = byId.get(row.telegram_message_id);
    byId.set(row.telegram_message_id, mergeHistoryMessageRow(prev, row, ctx));
  }
  const sorted = [...byId.values()].sort((a, b) => {
    const byTime = Date.parse(a.sent_at) - Date.parse(b.sent_at);
    if (byTime !== 0) return byTime;
    return a.telegram_message_id - b.telegram_message_id;
  });
  return collapseOutgoingEchoDuplicates(sorted, ctx);
}

async function warmupTelegramSession(chatId: number): Promise<void> {
  await warmupTelegramChatSession(chatId);
}

async function fetchChatHistoryPage(
  chatId: number,
  limit: number,
  peerUserId: number | null | undefined,
  beforeMessageId?: number | null,
): Promise<{
  messages: MessageChatHistoryItem[];
  chatKind: MessageChatKind | null;
  error: string | null;
  hasMoreOlder: boolean;
  nextBeforeMessageId: number | null;
  lastReadOutboxMessageId: number | null;
  memberCount: number | null;
  selfUserId: number | null;
}> {
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
  const url = buildApiUrl(`/api/telegram-messages-history?${params.toString()}`);
  const response = await fetch(url, { method: "GET", credentials: "include" });
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    messages?: unknown[];
    chat_kind?: unknown;
    member_count?: unknown;
    has_more_older?: boolean;
    next_before_message_id?: number;
    last_read_outbox_message_id?: number;
    self_user_id?: number;
    error?: string;
  };
  if (!response.ok || !json.ok) {
    return {
      messages: [],
      chatKind: null,
      error: json.error || `HTTP_${response.status}`,
      hasMoreOlder: false,
      nextBeforeMessageId: null,
      lastReadOutboxMessageId: null,
      memberCount: null,
      selfUserId: null,
    };
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
  const memberRaw = Number(json.member_count);
  return {
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
    memberCount:
      Number.isFinite(memberRaw) && memberRaw > 0 ? Math.trunc(memberRaw) : null,
    selfUserId,
  };
}

function applyHistoryMetaToSelectedChat(
  chatId: number,
  chatKind: MessageChatKind | null,
  memberCount: number | null,
): void {
  if (chatKind == null && memberCount == null) return;
  patchAuthenticatedHomeSelectedChatGroupMeta(chatId, {
    ...(chatKind != null ? { chat_kind: chatKind } : {}),
    ...(memberCount != null ? { member_count: memberCount } : {}),
  });
}

export function MessageChatMessageList({ chat, colors }: Props) {
  const { t } = useAppStrings();
  const { isAuthenticated } = useAuth();
  const { isTelegramMessagesConnected } = useTelegramMessagesConnection();
  const historyLoad = useAuthenticatedHomeHistoryLoadTarget();
  const shouldLoadHistory =
    historyLoad.chatId === chat.telegram_chat_id && historyLoad.generation > 0;

  const [messages, setMessages] = useState<MessageChatHistoryItem[]>([]);
  const [chatKind, setChatKind] = useState<MessageChatKind | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [nextBeforeMessageId, setNextBeforeMessageId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReadOutboxFromHistory, setLastReadOutboxFromHistory] = useState<number | null>(null);
  const [selfUserId, setSelfUserId] = useState<number | null>(null);
  const [columnWidthPx, setColumnWidthPx] = useState(0);
  const scrollControllerRef = useRef<HspScrollColumnHandle | null>(null);
  const loadingOlderRef = useRef(false);
  const nextBeforeMessageIdRef = useRef<number | null>(null);
  const pendingScrollAnchorRef = useRef<HspScrollAnchor | null>(null);
  const lastLiveSignatureRef = useRef("");
  const historyPollInFlightRef = useRef(false);
  const historyPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatLiveSignatureValue = chatLiveSignature(chat);
  const historyMessageContext = useMemo(
    (): HistoryMessageContext => ({
      peerUserId: chat.peer_user_id,
      selfUserId,
    }),
    [chat.peer_user_id, selfUserId],
  );

  useEffect(() => {
    lastLiveSignatureRef.current = "";
  }, [chat.telegram_chat_id]);

  const onColumnLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setColumnWidthPx((current) => (current === next ? current : next));
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollControllerRef.current?.scrollToEnd();
      requestAnimationFrame(() => scrollControllerRef.current?.scrollToEnd());
    });
  }, []);

  const readOutboxCursor = useMemo(
    () =>
      mergeReadOutboxCursor(
        chat.last_read_outbox_message_id,
        lastReadOutboxFromHistory,
        maxReadOutboxMessageIdFromItems(messages),
      ),
    [chat.last_read_outbox_message_id, lastReadOutboxFromHistory, messages],
  );

  useEffect(() => {
    patchAuthenticatedHomeSelectedChatReadOutbox(readOutboxCursor);
  }, [readOutboxCursor]);

  const displayMessages = useMemo(() => {
    const enriched = messages.map(enrichHistoryMessageDisplay);
    if (chatKind !== "private") return enriched;
    return patchOutgoingStatusesWithReadOutbox(enriched, readOutboxCursor);
  }, [chatKind, messages, readOutboxCursor]);

  useEffect(() => {
    nextBeforeMessageIdRef.current = nextBeforeMessageId;
  }, [nextBeforeMessageId]);

  useLayoutEffect(() => {
    const anchor = pendingScrollAnchorRef.current;
    if (!anchor) return;
    pendingScrollAnchorRef.current = null;
    scrollControllerRef.current?.restoreScrollAnchor(anchor);
    scrollControllerRef.current?.clearNearTopLatch();
  }, [messages]);

  useEffect(() => {
    return subscribeOutgoingChatMessages(({ chatId, message }) => {
      if (chatId !== chat.telegram_chat_id) return;
      setMessages((prev) => mergeHistoryMessages(prev, [message], historyMessageContext));
      scrollToBottom();
    });
  }, [chat.telegram_chat_id, historyMessageContext, scrollToBottom]);

  useEffect(() => {
    if (!shouldLoadHistory || !isAuthenticated || !isTelegramMessagesConnected) {
      setMessages([]);
      setChatKind(null);
      setError(null);
      setLoadingInitial(false);
      setLoadingOlder(false);
      setHasMoreOlder(false);
      setNextBeforeMessageId(null);
      setLastReadOutboxFromHistory(null);
      setSelfUserId(null);
      return;
    }

    let cancelled = false;
    setLoadingInitial(true);
    setLoadingOlder(false);
    setError(null);
    setMessages([]);
    setChatKind(null);
    setHasMoreOlder(false);
    setNextBeforeMessageId(null);
    setLastReadOutboxFromHistory(null);
    setSelfUserId(null);

    logPageDisplay("messages_history_load_start", chatLogFields({
      chatId: chat.telegram_chat_id,
      peerUserId: chat.peer_user_id,
      title: chat.title,
    }));

    void (async () => {
      try {
        const warmupPromise = warmupTelegramSession(chat.telegram_chat_id);
        let result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          chat.peer_user_id,
        );
        if (
          result.error === "session_not_ready" ||
          result.error === "history_unavailable" ||
          result.error === "not_found"
        ) {
          await warmupPromise;
          result = await fetchChatHistoryPage(
            chat.telegram_chat_id,
            MESSAGE_CHAT_HISTORY_PAGE_SIZE,
            chat.peer_user_id,
          );
        }
        if (cancelled) return;
        if (result.error) {
          throw new Error(result.error);
        }
        setMessages(result.messages);
        setChatKind(result.chatKind);
        if (result.selfUserId != null) {
          setSelfUserId(result.selfUserId);
        }
        applyHistoryMetaToSelectedChat(
          chat.telegram_chat_id,
          result.chatKind,
          result.memberCount,
        );
        setHasMoreOlder(result.hasMoreOlder);
        setNextBeforeMessageId(result.nextBeforeMessageId);
        setLastReadOutboxFromHistory((prev) =>
          mergeReadOutboxCursor(prev, result.lastReadOutboxMessageId),
        );
        logPageDisplay("messages_history_load_ok", {
          ...chatLogFields({
            chatId: chat.telegram_chat_id,
            peerUserId: chat.peer_user_id,
            title: chat.title,
          }),
          count: result.messages.length,
          chatKind: result.chatKind,
          hasMoreOlder: result.hasMoreOlder,
        });
        scrollToBottom();
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        logPageDisplay("messages_history_load_error", {
          ...chatLogFields({
            chatId: chat.telegram_chat_id,
            peerUserId: chat.peer_user_id,
            title: chat.title,
          }),
          message,
        });
        setError(message);
        setMessages([]);
        setHasMoreOlder(false);
        setNextBeforeMessageId(null);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    chat.telegram_chat_id,
    chat.peer_user_id,
    chat.title,
    historyLoad.generation,
    isAuthenticated,
    isTelegramMessagesConnected,
    scrollToBottom,
    shouldLoadHistory,
  ]);

  useEffect(() => {
    if (!shouldLoadHistory || !isAuthenticated || !isTelegramMessagesConnected || loadingInitial) {
      return;
    }

    let cancelled = false;

    const pollLatest = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (historyPollInFlightRef.current) return;
      const signature = chatLiveSignatureValue;
      if (signature === lastLiveSignatureRef.current) return;

      historyPollInFlightRef.current = true;
      try {
        const result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          chat.peer_user_id,
        );
        if (cancelled || result.error) return;

        lastLiveSignatureRef.current = signature;
        setMessages((prev) => {
          const merged = mergeHistoryMessages(prev, result.messages, historyMessageContext);
          const prevMaxId = prev.length > 0 ? prev[prev.length - 1]!.telegram_message_id : 0;
          const mergedMaxId =
            merged.length > 0 ? merged[merged.length - 1]!.telegram_message_id : 0;
          if (mergedMaxId > prevMaxId) {
            scrollToBottom();
          }
          return merged;
        });
        if (result.selfUserId != null) {
          setSelfUserId(result.selfUserId);
        }
        setLastReadOutboxFromHistory((prev) =>
          mergeReadOutboxCursor(prev, result.lastReadOutboxMessageId),
        );
        applyHistoryMetaToSelectedChat(
          chat.telegram_chat_id,
          result.chatKind,
          result.memberCount,
        );
      } finally {
        historyPollInFlightRef.current = false;
      }
    };

    const schedulePollLatest = () => {
      if (historyPollTimerRef.current != null) {
        clearTimeout(historyPollTimerRef.current);
      }
      historyPollTimerRef.current = setTimeout(() => {
        historyPollTimerRef.current = null;
        void pollLatest();
      }, 300);
    };

    schedulePollLatest();

    const pollMs = CHAT_HISTORY_STREAM_ENABLED
      ? MESSAGE_CHAT_LIVE_POLL_STREAM_FALLBACK_MS
      : MESSAGE_CHAT_LIVE_POLL_MS;
    const timer = setInterval(() => {
      schedulePollLatest();
    }, pollMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (historyPollTimerRef.current != null) {
        clearTimeout(historyPollTimerRef.current);
        historyPollTimerRef.current = null;
      }
    };
  }, [
    chat.telegram_chat_id,
    chatLiveSignatureValue,
    historyMessageContext,
    isAuthenticated,
    isTelegramMessagesConnected,
    loadingInitial,
    scrollToBottom,
    shouldLoadHistory,
  ]);

  const loadOlderMessages = useCallback(async () => {
    const beforeMessageId = nextBeforeMessageIdRef.current;
    if (
      loadingInitial ||
      loadingOlderRef.current ||
      !hasMoreOlder ||
      beforeMessageId == null
    ) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const scrollAnchor = scrollControllerRef.current?.captureScrollAnchor();

    logPageDisplay("messages_history_load_older_start", {
      ...chatLogFields({
        chatId: chat.telegram_chat_id,
        peerUserId: chat.peer_user_id,
        title: chat.title,
      }),
      beforeMessageId,
    });

    try {
      let cursor = beforeMessageId;
      let result = await fetchChatHistoryPage(
        chat.telegram_chat_id,
        MESSAGE_CHAT_HISTORY_PAGE_SIZE,
        chat.peer_user_id,
        cursor,
      );
      if (
        result.error === "session_not_ready" ||
        result.error === "history_unavailable"
      ) {
        await warmupTelegramSession(chat.telegram_chat_id);
        result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          chat.peer_user_id,
          cursor,
        );
      }

      for (let skipAttempt = 0; skipAttempt < 4; skipAttempt += 1) {
        if (result.error) break;
        if (result.messages.length > 0) break;
        if (
          !result.hasMoreOlder ||
          result.nextBeforeMessageId == null ||
          result.nextBeforeMessageId >= cursor
        ) {
          break;
        }
        cursor = result.nextBeforeMessageId;
        result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          chat.peer_user_id,
          cursor,
        );
      }

      if (result.error) {
        logPageDisplay("messages_history_load_older_error", {
          ...chatLogFields({
            chatId: chat.telegram_chat_id,
            peerUserId: chat.peer_user_id,
            title: chat.title,
          }),
          beforeMessageId,
          message: result.error,
        });
        return;
      }

      if (result.messages.length === 0) {
        setHasMoreOlder(result.hasMoreOlder);
        setNextBeforeMessageId(result.nextBeforeMessageId);
        logPageDisplay("messages_history_load_older_empty", {
          ...chatLogFields({
            chatId: chat.telegram_chat_id,
            peerUserId: chat.peer_user_id,
            title: chat.title,
          }),
          beforeMessageId,
          hasMoreOlder: result.hasMoreOlder,
          nextBeforeMessageId: result.nextBeforeMessageId,
        });
        return;
      }

      let addedCount = 0;
      setMessages((prev) => {
        const merged = mergeHistoryMessages(prev, result.messages, historyMessageContext);
        addedCount = merged.length - prev.length;
        return merged;
      });
      if (addedCount === 0) {
        pendingScrollAnchorRef.current = null;
        const nextCursor =
          result.nextBeforeMessageId ??
          Math.min(...result.messages.map((row) => row.telegram_message_id));
        if (nextCursor != null && nextCursor < beforeMessageId) {
          setNextBeforeMessageId(nextCursor);
          setHasMoreOlder(result.hasMoreOlder);
          logPageDisplay("messages_history_load_older_advance_cursor", {
            ...chatLogFields({
              chatId: chat.telegram_chat_id,
              peerUserId: chat.peer_user_id,
              title: chat.title,
            }),
            beforeMessageId,
            nextBeforeMessageId: nextCursor,
            fetchedCount: result.messages.length,
          });
          return;
        }
        setHasMoreOlder(false);
        setNextBeforeMessageId(null);
        logPageDisplay("messages_history_load_older_duplicate_page", {
          ...chatLogFields({
            chatId: chat.telegram_chat_id,
            peerUserId: chat.peer_user_id,
            title: chat.title,
          }),
          beforeMessageId,
          fetchedCount: result.messages.length,
        });
        return;
      }
      if (result.selfUserId != null) {
        setSelfUserId(result.selfUserId);
      }
      if (scrollAnchor) {
        pendingScrollAnchorRef.current = scrollAnchor;
      }
      setHasMoreOlder(result.hasMoreOlder);
      setNextBeforeMessageId(result.nextBeforeMessageId);
      setLastReadOutboxFromHistory((prev) =>
        mergeReadOutboxCursor(prev, result.lastReadOutboxMessageId),
      );
      logPageDisplay("messages_history_load_older_ok", {
        ...chatLogFields({
          chatId: chat.telegram_chat_id,
          peerUserId: chat.peer_user_id,
          title: chat.title,
        }),
        beforeMessageId,
        fetchedCount: result.messages.length,
        addedCount,
        hasMoreOlder: result.hasMoreOlder,
        nextBeforeMessageId: result.nextBeforeMessageId,
      });
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [
    chat.peer_user_id,
    chat.telegram_chat_id,
    chat.title,
    hasMoreOlder,
    historyMessageContext,
    loadingInitial,
  ]);

  const handleNearTop = useCallback(() => {
    void loadOlderMessages();
  }, [loadOlderMessages]);

  const innerWidthPx = Math.max(
    0,
    columnWidthPx - MESSAGE_CHAT_BODY_PADDING_PX * 2,
  );

  if (!shouldLoadHistory) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 0,
          alignSelf: "stretch",
        }}
        onLayout={onColumnLayout}
      />
    );
  }

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        alignSelf: "stretch",
        position: "relative",
      }}
      onLayout={onColumnLayout}
    >
      <HspScrollColumn
        key={`${chat.telegram_chat_id}-${historyLoad.generation}`}
        style={{ flex: 1, minHeight: 0 }}
        indicatorColor={colors.accent}
        scrollbarRightInsetPx={layout.scrollIndicatorRightInsetPx}
        initialScrollPosition="bottom"
        nearTopThresholdPx={MESSAGE_CHAT_LOAD_OLDER_THRESHOLD_PX}
        onNearTop={hasMoreOlder ? handleNearTop : undefined}
        scrollControllerRef={scrollControllerRef}
        contentContainerStyle={{
          padding: MESSAGE_CHAT_BODY_PADDING_PX,
        }}
      >
        {loadingInitial && messages.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}

        {!loadingInitial && error && messages.length === 0 ? (
          <Text
            style={{
              color: colors.secondary,
              fontSize: 15,
              lineHeight: 20,
              textAlign: "left",
            }}
          >
            {t("messages.historyLoadError")}
          </Text>
        ) : null}

        {!loadingInitial && !error && messages.length === 0 ? (
          <Text
            style={{
              color: colors.secondary,
              fontSize: 15,
              lineHeight: 20,
              textAlign: "left",
            }}
          >
            {t("messages.chatEmpty")}
          </Text>
        ) : null}

        {displayMessages.map((item, index) => (
          <View key={item.telegram_message_id}>
            {index > 0 ? <View style={{ height: MESSAGE_BUBBLE_ROW_GAP_PX }} /> : null}
            <MessageChatMessageRow
              chat={chat}
              chatKind={chatKind}
              item={item}
              colors={colors}
              columnWidthPx={innerWidthPx}
              selfUserId={selfUserId}
            />
          </View>
        ))}
      </HspScrollColumn>

      {loadingOlder ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: MESSAGE_CHAT_BODY_PADDING_PX,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}
