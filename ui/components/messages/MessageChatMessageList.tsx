import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from "react-native";
import { buildApiUrl } from "../../../api/_base";
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
import { patchAuthenticatedHomeSelectedChatReadOutbox } from "../../authenticatedHomeSelectedChat";
import {
  coalesceOutgoingStatus,
  effectiveReadOutboxMessageId as mergeReadOutboxCursor,
  enrichHistoryMessageDisplay,
  maxReadOutboxMessageIdFromItems,
  mergeHistoryMessageRow,
  patchOutgoingStatusesWithReadOutbox,
} from "./messageChatHistoryTypes";
import { MessageChatMessageRow } from "./MessageChatMessageRow";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

const MESSAGE_CHAT_LIVE_POLL_MS = 2_000;

function normalizeHistoryMessage(raw: unknown): MessageChatHistoryItem | null {
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
  const isOutgoing = Boolean(row.is_outgoing ?? row.isOutgoing);
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
      };
    }
  }
  return enrichHistoryMessageDisplay({
    telegram_message_id: telegramMessageId,
    text,
    sent_at: typeof row.sent_at === "string" ? row.sent_at : "",
    sender_name: typeof row.sender_name === "string" ? row.sender_name : "",
    sender_user_id: safeTelegramUserIdForLog(senderUserId) ?? null,
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

function mergeHistoryMessages(
  existing: MessageChatHistoryItem[],
  incoming: MessageChatHistoryItem[],
): MessageChatHistoryItem[] {
  const byId = new Map<number, MessageChatHistoryItem>();
  for (const row of existing) {
    byId.set(row.telegram_message_id, enrichHistoryMessageDisplay(row));
  }
  for (const row of incoming) {
    const prev = byId.get(row.telegram_message_id);
    byId.set(row.telegram_message_id, mergeHistoryMessageRow(prev, row));
  }
  return [...byId.values()].sort((a, b) => {
    const byTime = Date.parse(a.sent_at) - Date.parse(b.sent_at);
    if (byTime !== 0) return byTime;
    return a.telegram_message_id - b.telegram_message_id;
  });
}

async function warmupTelegramSession(chatId: number): Promise<void> {
  await warmupTelegramChatSession(chatId);
}

async function fetchChatHistoryPage(
  chatId: number,
  limit: number,
  beforeMessageId?: number | null,
): Promise<{
  messages: MessageChatHistoryItem[];
  chatKind: MessageChatKind | null;
  error: string | null;
  hasMoreOlder: boolean;
  nextBeforeMessageId: number | null;
  lastReadOutboxMessageId: number | null;
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
    has_more_older?: boolean;
    next_before_message_id?: number;
    last_read_outbox_message_id?: number;
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
    };
  }
  const rows: MessageChatHistoryItem[] = [];
  if (Array.isArray(json.messages)) {
    for (const raw of json.messages) {
      const row = normalizeHistoryMessage(raw);
      if (row) rows.push(row);
    }
  }
  const lastReadRaw = Number(json.last_read_outbox_message_id);
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
  };
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
  const [columnWidthPx, setColumnWidthPx] = useState(0);
  const scrollControllerRef = useRef<HspScrollColumnHandle | null>(null);
  const loadingOlderRef = useRef(false);
  const pendingScrollAnchorRef = useRef<HspScrollAnchor | null>(null);

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
      setMessages((prev) => mergeHistoryMessages(prev, [message]));
      scrollToBottom();
    });
  }, [chat.telegram_chat_id, scrollToBottom]);

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

    logPageDisplay("messages_history_load_start", chatLogFields({
      chatId: chat.telegram_chat_id,
      peerUserId: chat.peer_user_id,
      title: chat.title,
    }));

    void (async () => {
      try {
        await warmupTelegramSession(chat.telegram_chat_id);
        let result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
        );
        if (
          result.error === "session_not_ready" ||
          result.error === "history_unavailable" ||
          result.error === "not_found"
        ) {
          await warmupTelegramSession(chat.telegram_chat_id);
          result = await fetchChatHistoryPage(
            chat.telegram_chat_id,
            MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          );
        }
        if (cancelled) return;
        if (result.error) {
          throw new Error(result.error);
        }
        setMessages(result.messages);
        setChatKind(result.chatKind);
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
      const result = await fetchChatHistoryPage(
        chat.telegram_chat_id,
        MESSAGE_CHAT_HISTORY_PAGE_SIZE,
      );
      if (cancelled || result.error) return;

      setMessages((prev) => {
        const merged = mergeHistoryMessages(prev, result.messages);
        const prevMaxId = prev.length > 0 ? prev[prev.length - 1]!.telegram_message_id : 0;
        const mergedMaxId =
          merged.length > 0 ? merged[merged.length - 1]!.telegram_message_id : 0;
        if (mergedMaxId > prevMaxId) {
          scrollToBottom();
        }
        return merged;
      });
      setLastReadOutboxFromHistory((prev) =>
        mergeReadOutboxCursor(prev, result.lastReadOutboxMessageId),
      );
    };

    const timer = setInterval(() => {
      void pollLatest();
    }, MESSAGE_CHAT_LIVE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    chat.telegram_chat_id,
    isAuthenticated,
    isTelegramMessagesConnected,
    loadingInitial,
    scrollToBottom,
    shouldLoadHistory,
  ]);

  useEffect(() => {
    if (!shouldLoadHistory || !isAuthenticated || !isTelegramMessagesConnected || loadingInitial) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await fetchChatHistoryPage(
        chat.telegram_chat_id,
        MESSAGE_CHAT_HISTORY_PAGE_SIZE,
      );
      if (cancelled || result.error) return;

      setMessages((prev) => {
        const merged = mergeHistoryMessages(prev, result.messages);
        const prevMaxId = prev.length > 0 ? prev[prev.length - 1]!.telegram_message_id : 0;
        const mergedMaxId =
          merged.length > 0 ? merged[merged.length - 1]!.telegram_message_id : 0;
        if (mergedMaxId > prevMaxId) {
          scrollToBottom();
        }
        return merged;
      });
      setLastReadOutboxFromHistory((prev) =>
        mergeReadOutboxCursor(prev, result.lastReadOutboxMessageId),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    chat.last_message_at,
    chat.subtitle,
    chat.telegram_chat_id,
    isAuthenticated,
    isTelegramMessagesConnected,
    loadingInitial,
    scrollToBottom,
    shouldLoadHistory,
  ]);

  const loadOlderMessages = useCallback(async () => {
    if (
      loadingInitial ||
      loadingOlderRef.current ||
      !hasMoreOlder ||
      nextBeforeMessageId == null
    ) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const scrollAnchor = scrollControllerRef.current?.captureScrollAnchor();

    try {
      let result = await fetchChatHistoryPage(
        chat.telegram_chat_id,
        MESSAGE_CHAT_HISTORY_PAGE_SIZE,
        nextBeforeMessageId,
      );
      if (
        result.error === "session_not_ready" ||
        result.error === "history_unavailable"
      ) {
        await warmupTelegramSession(chat.telegram_chat_id);
        result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          nextBeforeMessageId,
        );
      }
      if (result.error) return;

      if (result.messages.length === 0) {
        setHasMoreOlder(result.hasMoreOlder);
        setNextBeforeMessageId(result.nextBeforeMessageId);
        return;
      }

      if (scrollAnchor) {
        pendingScrollAnchorRef.current = scrollAnchor;
      }
      setMessages((prev) => mergeHistoryMessages(prev, result.messages));
      setHasMoreOlder(result.hasMoreOlder);
      setNextBeforeMessageId(result.nextBeforeMessageId);
      setLastReadOutboxFromHistory((prev) =>
        mergeReadOutboxCursor(prev, result.lastReadOutboxMessageId),
      );
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [chat.telegram_chat_id, hasMoreOlder, loadingInitial, nextBeforeMessageId]);

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
