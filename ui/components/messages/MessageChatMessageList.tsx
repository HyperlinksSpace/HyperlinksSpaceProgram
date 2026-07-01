import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from "react-native";
import { useAuth } from "../../../auth/AuthContext";
import { useAppStrings } from "../../../locales/AppStringsContext";
import {
  clearRecentChatSenderStatusRules,
  syncRecentChatSenderStatusRules,
} from "../../../shared/specialTelegramUsers";
import { useAuthenticatedHomeHistoryLoadTarget } from "../../authenticatedHomeSelectedChat";
import { chatLogFields, logPageDisplay } from "../../pageDisplayLog";
import {
  getCachedChatHistory,
  isChatHistoryCacheComplete,
  isChatHistoryCacheFresh,
  setCachedChatHistory,
  subscribeChatHistoryCache,
} from "../../messageChatHistoryCache";
import { subscribeOutgoingChatMessages } from "../../messageChatOutgoing";
import { layout, type ThemeColors } from "../../theme";
import { useTelegramMessagesConnection } from "../../telegram/TelegramMessagesConnectionContext";
import {
  fetchTelegramChatHistoryPage,
  loadTelegramChatHistoryFirstPage,
} from "../../telegram/fetchTelegramChatHistoryPage";
import { warmupTelegramChatSession } from "../../telegram/warmupTelegramChatSession";
import { HspScrollColumn, type HspScrollAnchor, type HspScrollColumnHandle } from "../HspScrollColumn";
import {
  MESSAGE_BUBBLE_ROW_GAP_PX,
  MESSAGE_CHAT_BODY_PADDING_PX,
  MESSAGE_CHAT_HISTORY_PAGE_SIZE,
  MESSAGE_CHAT_LOAD_OLDER_THRESHOLD_PX,
} from "./messageChatLayout";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import { patchAuthenticatedHomeSelectedChatReadOutbox, patchAuthenticatedHomeSelectedChatGroupMeta } from "../../authenticatedHomeSelectedChat";
import {
  effectiveReadOutboxMessageId as mergeReadOutboxCursor,
  enrichHistoryMessageDisplay,
  isPrivateChatForReadReceipts,
  maxReadOutboxMessageIdFromItems,
  mergeHistoryMessageRow,
  patchOutgoingStatusesWithReadOutbox,
  type HistoryMessageContext,
} from "./messageChatHistoryTypes";
import { MessageChatMessageRow } from "./MessageChatMessageRow";
import type { MessageChatRowData } from "./MessageChatRow";
import { telegramEmojiDebug } from "./telegramEmojiDebug";

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

  const applyCachedHistoryPage = useCallback(
    (cached: NonNullable<ReturnType<typeof getCachedChatHistory>>) => {
      setMessages(cached.messages);
      setChatKind(cached.chatKind);
      if (cached.selfUserId != null) {
        setSelfUserId(cached.selfUserId);
      }
      applyHistoryMetaToSelectedChat(
        chat.telegram_chat_id,
        cached.chatKind,
        cached.memberCount,
      );
      setHasMoreOlder(cached.hasMoreOlder);
      setNextBeforeMessageId(cached.nextBeforeMessageId);
      setLastReadOutboxFromHistory((prev) =>
        mergeReadOutboxCursor(prev, cached.lastReadOutboxMessageId),
      );
      setLoadingInitial(false);
      setError(null);
    },
    [chat.telegram_chat_id],
  );

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

  useEffect(() => {
    syncRecentChatSenderStatusRules(chat.telegram_chat_id, messages);
    return () => {
      clearRecentChatSenderStatusRules(chat.telegram_chat_id);
    };
  }, [chat.telegram_chat_id, messages]);

  const displayMessages = useMemo(() => {
    const enriched = messages.map(enrichHistoryMessageDisplay);
    const effectiveChatKind = chatKind ?? chat.chat_kind ?? null;
    if (!isPrivateChatForReadReceipts(effectiveChatKind, chat)) return enriched;
    return patchOutgoingStatusesWithReadOutbox(enriched, readOutboxCursor);
  }, [chat, chatKind, messages, readOutboxCursor]);

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
    if (!shouldLoadHistory) return;
    return subscribeChatHistoryCache((chatId) => {
      if (chatId !== chat.telegram_chat_id) return;
      const cached = getCachedChatHistory(chatId);
      if (cached == null || cached.messages.length === 0) return;
      applyCachedHistoryPage(cached);
      logPageDisplay("messages_history_cache_hit", {
        ...chatLogFields({
          chatId: chat.telegram_chat_id,
          peerUserId: chat.peer_user_id,
          title: chat.title,
        }),
        count: cached.messages.length,
        fresh: isChatHistoryCacheFresh(chat.telegram_chat_id),
        source: "cache_listener",
      });
      scrollToBottom();
    });
  }, [
    applyCachedHistoryPage,
    chat.peer_user_id,
    chat.telegram_chat_id,
    chat.title,
    scrollToBottom,
    shouldLoadHistory,
  ]);

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
    setLoadingOlder(false);
    setError(null);

    const cached = getCachedChatHistory(chat.telegram_chat_id);
    const cacheHit = cached != null && cached.messages.length > 0;

    if (cacheHit) {
      applyCachedHistoryPage(cached);
      logPageDisplay("messages_history_cache_hit", {
        ...chatLogFields({
          chatId: chat.telegram_chat_id,
          peerUserId: chat.peer_user_id,
          title: chat.title,
        }),
        count: cached.messages.length,
        fresh: isChatHistoryCacheFresh(chat.telegram_chat_id),
      });
      scrollToBottom();
    } else {
      setLoadingInitial(true);
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
    }

    void (async () => {
      try {
        const cacheComplete =
          cacheHit && isChatHistoryCacheComplete(chat.telegram_chat_id);
        if (cacheComplete && isChatHistoryCacheFresh(chat.telegram_chat_id)) {
          return;
        }
        const result = await loadTelegramChatHistoryFirstPage(
          chat.telegram_chat_id,
          chat.peer_user_id,
        );
        if (cancelled) return;
        if (result.error) {
          throw new Error(result.error);
        }
        setCachedChatHistory(chat.telegram_chat_id, result, { previewOnly: false });
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
        logPageDisplay(cacheHit ? "messages_history_cache_revalidated" : "messages_history_load_ok", {
          ...chatLogFields({
            chatId: chat.telegram_chat_id,
            peerUserId: chat.peer_user_id,
            title: chat.title,
          }),
          count: result.messages.length,
          chatKind: result.chatKind,
          hasMoreOlder: result.hasMoreOlder,
        });
        telegramEmojiDebug.historySummary(
          result.messages,
          chat.peer_emoji_status_custom_emoji_id ?? null,
        );
        scrollToBottom();
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        if (cacheHit) {
          logPageDisplay("messages_history_cache_revalidate_error", {
            ...chatLogFields({
              chatId: chat.telegram_chat_id,
              peerUserId: chat.peer_user_id,
              title: chat.title,
            }),
            message,
          });
          return;
        }
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
        if (!cancelled && !cacheHit) setLoadingInitial(false);
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
        const result = await fetchTelegramChatHistoryPage(
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
        setCachedChatHistory(chat.telegram_chat_id, result);
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
      let result = await fetchTelegramChatHistoryPage(
        chat.telegram_chat_id,
        MESSAGE_CHAT_HISTORY_PAGE_SIZE,
        chat.peer_user_id,
        cursor,
      );
      if (
        result.error === "session_not_ready" ||
        result.error === "history_unavailable"
      ) {
        await warmupTelegramChatSession(chat.telegram_chat_id);
        result = await fetchTelegramChatHistoryPage(
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
        result = await fetchTelegramChatHistoryPage(
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
