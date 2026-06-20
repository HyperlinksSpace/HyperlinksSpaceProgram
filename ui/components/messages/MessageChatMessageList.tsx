import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from "react-native";
import { buildApiUrl } from "../../../api/_base";
import { useAuth } from "../../../auth/AuthContext";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { layout, type ThemeColors } from "../../theme";
import { useTelegramMessagesConnection } from "../../telegram/TelegramMessagesConnectionContext";
import { HspScrollColumn } from "../HspScrollColumn";
import {
  MESSAGE_BUBBLE_ROW_GAP_PX,
  MESSAGE_CHAT_BODY_PADDING_PX,
} from "./messageChatLayout";
import type { MessageChatHistoryItem } from "./messageChatHistoryTypes";
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
  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!Number.isFinite(telegramMessageId) || !text) return null;
  const senderUserId = Number(row.sender_user_id);
  return {
    telegram_message_id: telegramMessageId,
    text,
    sent_at: typeof row.sent_at === "string" ? row.sent_at : "",
    sender_name: typeof row.sender_name === "string" ? row.sender_name : "",
    sender_user_id: Number.isFinite(senderUserId) ? senderUserId : null,
    is_outgoing: Boolean(row.is_outgoing),
  };
}

async function warmupTelegramSession(): Promise<void> {
  await fetch(buildApiUrl("/api/telegram-messages-warmup"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
}

async function fetchChatHistory(
  chatId: number,
  limit = 50,
): Promise<{ messages: MessageChatHistoryItem[]; error: string | null }> {
  const url = buildApiUrl(`/api/telegram-messages-history?chat_id=${chatId}&limit=${limit}`);
  const response = await fetch(url, { method: "GET", credentials: "include" });
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    messages?: unknown[];
    error?: string;
  };
  if (!response.ok || !json.ok) {
    return { messages: [], error: json.error || `HTTP_${response.status}` };
  }
  const rows: MessageChatHistoryItem[] = [];
  if (Array.isArray(json.messages)) {
    for (const raw of json.messages) {
      const row = normalizeHistoryMessage(raw);
      if (row) rows.push(row);
    }
  }
  return { messages: rows, error: null };
}

export function MessageChatMessageList({ chat, colors }: Props) {
  const { t } = useAppStrings();
  const { isAuthenticated } = useAuth();
  const { isTelegramMessagesConnected } = useTelegramMessagesConnection();
  const [messages, setMessages] = useState<MessageChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnWidthPx, setColumnWidthPx] = useState(0);
  const columnBleedPx = layout.contentSideInsetPx;

  const onColumnLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setColumnWidthPx((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isTelegramMessagesConnected) {
      setMessages([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        await warmupTelegramSession();
        let result = await fetchChatHistory(chat.telegram_chat_id);
        if (
          result.error === "session_not_ready" ||
          result.error === "history_unavailable" ||
          result.error === "not_found"
        ) {
          await warmupTelegramSession();
          result = await fetchChatHistory(chat.telegram_chat_id);
        }
        if (cancelled) return;
        if (result.error) {
          throw new Error(result.error);
        }
        setMessages(result.messages);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chat.telegram_chat_id, isAuthenticated, isTelegramMessagesConnected]);

  const innerWidthPx = Math.max(
    0,
    columnWidthPx - MESSAGE_CHAT_BODY_PADDING_PX * 2,
  );

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        alignSelf: "stretch",
        marginHorizontal: -columnBleedPx,
      }}
      onLayout={onColumnLayout}
    >
      <HspScrollColumn
        style={{ flex: 1, minHeight: 0 }}
        indicatorColor={colors.accent}
        scrollbarRightInsetPx={layout.scrollIndicatorRightInsetPx}
        contentContainerStyle={{
          padding: MESSAGE_CHAT_BODY_PADDING_PX,
        }}
      >
        {loading && messages.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}

        {!loading && error && messages.length === 0 ? (
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

        {!loading && !error && messages.length === 0 ? (
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
