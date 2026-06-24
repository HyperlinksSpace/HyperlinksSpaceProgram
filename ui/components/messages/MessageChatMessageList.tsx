import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from "react-native";
import { buildApiUrl } from "../../../api/_base";
import { useAuth } from "../../../auth/AuthContext";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { useAuthenticatedHomeHistoryLoadTarget } from "../../authenticatedHomeSelectedChat";
import { layout, type ThemeColors } from "../../theme";
import { useTelegramMessagesConnection } from "../../telegram/TelegramMessagesConnectionContext";
import { HspScrollColumn, type HspScrollColumnHandle } from "../HspScrollColumn";
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
import { MessageChatMessageRow } from "./MessageChatMessageRow";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

function normalizeHistoryMessage(raw: unknown): MessageChatHistoryItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const telegramMessageId = Number(row.telegram_message_id);
  if (!Number.isFinite(telegramMessageId)) return null;
  const text = typeof row.text === "string" ? row.text : "";
  const hasMedia = Boolean(row.has_media);
  const contentKindRaw = row.content_kind;
  const contentKind =
    contentKindRaw === "text" ||
    contentKindRaw === "photo" ||
    contentKindRaw === "video" ||
    contentKindRaw === "document" ||
    contentKindRaw === "animation" ||
    contentKindRaw === "sticker" ||
    contentKindRaw === "other"
      ? (contentKindRaw as MessageChatContentKind)
      : undefined;
  if (!text.trim() && !hasMedia) return null;
  const senderUserId = Number(row.sender_user_id);
  const senderChatId = Number(row.sender_chat_id);
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
        sender_user_id: Number.isFinite(replySenderUserId) ? replySenderUserId : null,
        text: replyText,
      };
    }
  }
  return {
    telegram_message_id: telegramMessageId,
    text,
    sent_at: typeof row.sent_at === "string" ? row.sent_at : "",
    sender_name: typeof row.sender_name === "string" ? row.sender_name : "",
    sender_user_id: Number.isFinite(senderUserId) ? senderUserId : null,
    sender_chat_id: Number.isFinite(senderChatId) ? senderChatId : null,
    sender_is_channel: Boolean(row.sender_is_channel),
    is_outgoing: Boolean(row.is_outgoing),
    content_kind: contentKind,
    has_media: hasMedia,
    media_width: Number.isFinite(Number(row.media_width)) ? Number(row.media_width) : null,
    media_height: Number.isFinite(Number(row.media_height)) ? Number(row.media_height) : null,
    reply_to: replyTo,
  };
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
  for (const row of existing) byId.set(row.telegram_message_id, row);
  for (const row of incoming) byId.set(row.telegram_message_id, row);
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at),
  );
}

async function warmupTelegramSession(): Promise<void> {
  await fetch(buildApiUrl("/api/telegram-messages-warmup"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
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
    error?: string;
  };
  if (!response.ok || !json.ok) {
    return {
      messages: [],
      chatKind: null,
      error: json.error || `HTTP_${response.status}`,
      hasMoreOlder: false,
      nextBeforeMessageId: null,
    };
  }
  const rows: MessageChatHistoryItem[] = [];
  if (Array.isArray(json.messages)) {
    for (const raw of json.messages) {
      const row = normalizeHistoryMessage(raw);
      if (row) rows.push(row);
    }
  }
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
  const [columnWidthPx, setColumnWidthPx] = useState(0);
  const scrollControllerRef = useRef<HspScrollColumnHandle | null>(null);
  const loadingOlderRef = useRef(false);

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

  useEffect(() => {
    if (!shouldLoadHistory || !isAuthenticated || !isTelegramMessagesConnected) {
      setMessages([]);
      setChatKind(null);
      setError(null);
      setLoadingInitial(false);
      setLoadingOlder(false);
      setHasMoreOlder(false);
      setNextBeforeMessageId(null);
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

    void (async () => {
      try {
        await warmupTelegramSession();
        let result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
        );
        if (
          result.error === "session_not_ready" ||
          result.error === "history_unavailable" ||
          result.error === "not_found"
        ) {
          await warmupTelegramSession();
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
        scrollToBottom();
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
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
    historyLoad.generation,
    isAuthenticated,
    isTelegramMessagesConnected,
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
    const metricsBefore = scrollControllerRef.current?.getMetrics();

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
        await warmupTelegramSession();
        result = await fetchChatHistoryPage(
          chat.telegram_chat_id,
          MESSAGE_CHAT_HISTORY_PAGE_SIZE,
          nextBeforeMessageId,
        );
      }
      if (result.error) return;

      setMessages((prev) => mergeHistoryMessages(prev, result.messages));
      setHasMoreOlder(result.hasMoreOlder);
      setNextBeforeMessageId(result.nextBeforeMessageId);

      if (metricsBefore) {
        requestAnimationFrame(() => {
          const metricsAfter = scrollControllerRef.current?.getMetrics();
          if (!metricsAfter) return;
          const delta = metricsAfter.contentH - metricsBefore.contentH;
          if (delta > 0) {
            scrollControllerRef.current?.scrollToY(metricsBefore.scrollY + delta);
          }
        });
      }
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
        {loadingOlder ? (
          <View style={{ paddingBottom: 12, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}

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

        {messages.map((item, index) => (
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
    </View>
  );
}
