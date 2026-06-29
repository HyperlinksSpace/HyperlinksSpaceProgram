import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { buildApiUrl } from "../../api/_base";
import { useAuth } from "../../auth/AuthContext";
import { useAppStrings } from "../../locales/AppStringsContext";
import { logPageDisplay, firstChatListLogFields, chatLogFields } from "../pageDisplayLog";
import { layout, type ThemeColors } from "../theme";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import {
  clearAuthenticatedHomeSelectedChat,
  openAuthenticatedHomeChatHistory,
  syncAuthenticatedHomeSelectedChat,
  useAuthenticatedHomeSelectedChat,
} from "../authenticatedHomeSelectedChat";
import { MessageChatRow, type MessageChatRowData } from "./messages/MessageChatRow";
import { homeListShellStyle } from "./messages/messageListLayout";

type Props = {
  colors: ThemeColors;
  scrollable?: boolean;
};

function normalizeChat(raw: unknown): MessageChatRowData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  const telegramChatId = Number(row.telegram_chat_id);
  if (!Number.isFinite(id) || !Number.isFinite(telegramChatId)) return null;
  const title = typeof row.title === "string" ? row.title : "";
  const subtitle = typeof row.subtitle === "string" ? row.subtitle : "";
  const avatarUrl = typeof row.avatar_url === "string" ? row.avatar_url : null;
  const lastAt =
    typeof row.last_message_at === "string" || typeof row.last_message_at === "number"
      ? row.last_message_at
      : null;
  const unread = Number(row.unread_count);
  const peerUserId = Number(row.peer_user_id);
  const presenceKindRaw = row.presence_kind;
  const presenceKind =
    presenceKindRaw === "online" ||
    presenceKindRaw === "recently" ||
    presenceKindRaw === "last_week" ||
    presenceKindRaw === "last_month" ||
    presenceKindRaw === "offline"
      ? presenceKindRaw
      : null;
  const presenceAt =
    typeof row.presence_at === "string" || typeof row.presence_at === "number"
      ? String(row.presence_at)
      : null;
  const chatActionRaw = row.chat_action;
  const chatAction =
    chatActionRaw === "typing" ||
    chatActionRaw === "recording_voice" ||
    chatActionRaw === "recording_video" ||
    chatActionRaw === "uploading_photo" ||
    chatActionRaw === "uploading_video" ||
    chatActionRaw === "uploading_file"
      ? chatActionRaw
      : null;
  const chatActionUserId = Number(row.chat_action_user_id);
  const chatActionUserName =
    typeof row.chat_action_user_name === "string" ? row.chat_action_user_name : null;
  const chatActionExpiresAt =
    typeof row.chat_action_expires_at === "string" || typeof row.chat_action_expires_at === "number"
      ? String(row.chat_action_expires_at)
      : null;
  return {
    id,
    telegram_chat_id: telegramChatId,
    title,
    subtitle,
    avatar_url: avatarUrl,
    last_message_at: lastAt == null ? null : String(lastAt),
    unread_count: Number.isFinite(unread) ? unread : 0,
    peer_user_id: Number.isFinite(peerUserId) ? peerUserId : null,
    presence_kind: presenceKind,
    presence_at: presenceAt,
    chat_action: chatAction,
    chat_action_user_id: Number.isFinite(chatActionUserId) ? chatActionUserId : null,
    chat_action_user_name: chatActionUserName,
    chat_action_expires_at: chatActionExpiresAt,
    last_read_outbox_message_id: (() => {
      const raw = Number(row.last_read_outbox_message_id);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })(),
    is_pinned: Boolean(row.is_pinned),
  };
}

function chatsChanged(prev: MessageChatRowData[], next: MessageChatRowData[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    if (prev[i]?.telegram_chat_id !== next[i]?.telegram_chat_id) return true;
  }
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.title !== b.title ||
      a.subtitle !== b.subtitle ||
      a.last_message_at !== b.last_message_at ||
      a.unread_count !== b.unread_count ||
      a.avatar_url !== b.avatar_url ||
      a.presence_kind !== b.presence_kind ||
      a.presence_at !== b.presence_at ||
      a.chat_action !== b.chat_action ||
      a.chat_action_user_id !== b.chat_action_user_id ||
      a.chat_action_user_name !== b.chat_action_user_name ||
      a.chat_action_expires_at !== b.chat_action_expires_at ||
      a.last_read_outbox_message_id !== b.last_read_outbox_message_id ||
      Boolean(a.is_pinned) !== Boolean(b.is_pinned)
    ) {
      return true;
    }
  }
  return false;
}

function sortChatRows(rows: MessageChatRowData[]): MessageChatRowData[] {
  return [...rows].sort((a, b) => {
    const aPinned = Boolean(a.is_pinned);
    const bPinned = Boolean(b.is_pinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return tb - ta;
  });
}

const MESSAGES_POLL_MS = 1_500;
const MESSAGES_RESYNC_MS = 60_000;

export function AuthenticatedHomeMessagesPanel({ colors, scrollable = true }: Props) {
  const { t } = useAppStrings();
  const { authReady, isAuthenticated } = useAuth();
  const { isTelegramMessagesConnected, refreshStatus } = useTelegramMessagesConnection();
  const [chats, setChats] = useState<MessageChatRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedChat = useAuthenticatedHomeSelectedChat();
  const selectedChatId = selectedChat?.telegram_chat_id ?? null;
  const { width: windowWidth } = useWindowDimensions();
  const wideListChrome = windowWidth > layout.authenticatedHome.firstBreakpoint;
  const chatSelectionEnabled = wideListChrome;
  const lastGatewayResyncRef = useRef(0);
  const pollCountRef = useRef(0);
  const lastLiveRevisionRef = useRef<number | null>(null);

  const triggerGatewayResync = useCallback(async (reason: string) => {
    const url = buildApiUrl("/api/telegram-messages-resync");
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        chatCount?: number;
        error?: string;
        needsReconnect?: boolean;
        connected?: boolean;
        warming?: boolean;
      };
      logPageDisplay("messages_gateway_resync", {
        reason,
        ok: json.ok ?? false,
        warming: json.warming ?? false,
        chatCount: json.chatCount ?? null,
        error: json.error ?? null,
        needsReconnect: json.needsReconnect ?? false,
        elapsedMs: Date.now() - started,
        status: response.status,
      });
      lastGatewayResyncRef.current = Date.now();
      if (json.needsReconnect || json.connected === false) {
        await refreshStatus();
        return false;
      }
      return response.ok && (json.ok !== false || json.warming === true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logPageDisplay("messages_gateway_resync_error", { reason, message });
      return false;
    }
  }, [refreshStatus]);

  const loadChats = useCallback(async (options?: { allowAvatarResync?: boolean; silent?: boolean }) => {
    if (!isAuthenticated || !isTelegramMessagesConnected) {
      setChats([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }
    const url = buildApiUrl("/api/telegram-messages-chats");
    const started = Date.now();
    try {
      const response = await fetch(url, { method: "GET", credentials: "include" });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        chats?: unknown[];
        error?: string;
        source?: string;
        revision?: number;
      };
      if (!response.ok || !json.ok) {
        throw new Error(json.error || `HTTP_${response.status}`);
      }
      const rows: MessageChatRowData[] = [];
      if (Array.isArray(json.chats)) {
        for (const raw of json.chats) {
          const row = normalizeChat(raw);
          if (row) rows.push(row);
        }
      }
      rows.sort((a, b) => {
        const aPinned = Boolean(a.is_pinned);
        const bPinned = Boolean(b.is_pinned);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
        const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
        return tb - ta;
      });
      const missingPreviewCount = rows.filter((row) => !row.subtitle.trim()).length;
      const missingAvatarFieldCount = rows.filter((row) => !row.avatar_url).length;
      if (json.source === "live" && typeof json.revision === "number") {
        lastLiveRevisionRef.current = json.revision;
      }
      setChats((prev) => {
        const changed = chatsChanged(prev, rows);
        if (options?.silent) {
          if (changed) {
            logPageDisplay("messages_chats_poll_updated", {
              count: rows.length,
              ...firstChatListLogFields(rows),
              poll: pollCountRef.current,
              source: json.source ?? null,
              revision: json.revision ?? null,
              elapsedMs: Date.now() - started,
              missingPreviewCount,
              missingAvatarFieldCount,
            });
          } else if (pollCountRef.current % 10 === 0) {
            logPageDisplay("messages_chats_poll_steady", {
              count: rows.length,
              poll: pollCountRef.current,
              source: json.source ?? null,
              revision: json.revision ?? null,
              elapsedMs: Date.now() - started,
            });
          }
          return changed ? sortChatRows(rows) : prev;
        }
        return sortChatRows(rows);
      });
      syncAuthenticatedHomeSelectedChat(rows);
      if (!options?.silent) {
        logPageDisplay("messages_chats_loaded", {
          count: rows.length,
          ...firstChatListLogFields(rows),
          source: json.source ?? null,
          revision: json.revision ?? null,
          status: response.status,
          elapsedMs: Date.now() - started,
          missingPreviewCount,
          missingAvatarFieldCount,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!options?.silent) {
        logPageDisplay("messages_chats_error", { message, elapsedMs: Date.now() - started });
        setError(message);
        setChats([]);
      } else {
        logPageDisplay("messages_chats_poll_error", {
          message,
          poll: pollCountRef.current,
          elapsedMs: Date.now() - started,
        });
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [isAuthenticated, isTelegramMessagesConnected, triggerGatewayResync]);

  useEffect(() => {
    if (!authReady) return;
    lastGatewayResyncRef.current = 0;
    pollCountRef.current = 0;
    void (async () => {
      await loadChats();
      await triggerGatewayResync("initial_mount");
      await loadChats({ silent: true });
    })();
  }, [authReady, isTelegramMessagesConnected, loadChats, triggerGatewayResync]);

  useEffect(() => {
    if (!authReady || !isTelegramMessagesConnected) return;
    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      pollCountRef.current += 1;
      const dueResync = Date.now() - lastGatewayResyncRef.current >= MESSAGES_RESYNC_MS;
      void (async () => {
        if (dueResync) {
          await triggerGatewayResync("poll_interval");
        }
        await loadChats({ silent: true, allowAvatarResync: false });
      })();
    };
    const timer = setInterval(poll, MESSAGES_POLL_MS);
    return () => clearInterval(timer);
  }, [authReady, isTelegramMessagesConnected, loadChats, triggerGatewayResync]);

  const handleChatPress = useCallback(
    (item: MessageChatRowData) => {
      if (!chatSelectionEnabled) return;
      logPageDisplay("messages_chat_open", chatLogFields({
        chatId: item.telegram_chat_id,
        peerUserId: item.peer_user_id,
        title: item.title,
      }));
      openAuthenticatedHomeChatHistory(item);
    },
    [chatSelectionEnabled],
  );

  const handleClearSelection = useCallback(() => {
    if (!chatSelectionEnabled) return;
    clearAuthenticatedHomeSelectedChat();
  }, [chatSelectionEnabled]);

  const listShellStyle = homeListShellStyle(wideListChrome);

  if (!isTelegramMessagesConnected) {
    return (
      <View style={[listShellStyle, { paddingVertical: 24, alignItems: "center" }]}>
        <Text
          style={{
            textAlign: "center",
            color: colors.secondary,
            fontSize: 15,
            lineHeight: 20,
            maxWidth: 320,
          }}
        >
          {t("messages.connectPrompt")}
        </Text>
      </View>
    );
  }

  if (loading && chats.length === 0) {
    return (
      <View style={[listShellStyle, { paddingVertical: 24, alignItems: "center" }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (error && chats.length === 0) {
    return (
      <View style={[listShellStyle, { paddingVertical: 16 }]}>
        <Text style={{ textAlign: "center", color: colors.secondary, fontSize: 15, lineHeight: 20 }}>
          {t("messages.loadError")}
        </Text>
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={[listShellStyle, { paddingVertical: 16 }]}>
        <Text style={{ textAlign: "center", color: colors.secondary, fontSize: 15, lineHeight: 20 }}>
          {t("messages.empty")}
        </Text>
      </View>
    );
  }

  const list = (
    <Pressable style={{ width: "100%", alignSelf: "stretch" }} onPress={handleClearSelection}>
      <View style={listShellStyle} pointerEvents="box-none">
        {chats.map((item, index) => (
          <MessageChatRow
            key={item.telegram_chat_id}
            item={item}
            isLast={index === chats.length - 1}
            isActive={chatSelectionEnabled && selectedChatId === item.telegram_chat_id}
            colors={colors}
            timePendingLabel={t("feed.timePending")}
            onPress={chatSelectionEnabled ? () => handleChatPress(item) : undefined}
          />
        ))}
      </View>
    </Pressable>
  );

  if (!scrollable) {
    return list;
  }

  return (
    <ScrollView
      style={{ width: "100%" }}
      contentContainerStyle={{ ...listShellStyle, flexGrow: 1 }}
      onScrollBeginDrag={handleClearSelection}
    >
      {chats.map((item, index) => (
        <MessageChatRow
          key={item.telegram_chat_id}
          item={item}
          isLast={index === chats.length - 1}
          isActive={chatSelectionEnabled && selectedChatId === item.telegram_chat_id}
          colors={colors}
          timePendingLabel={t("feed.timePending")}
          onPress={chatSelectionEnabled ? () => handleChatPress(item) : undefined}
        />
      ))}
      <Pressable style={{ flexGrow: 1, minHeight: 1 }} onPress={handleClearSelection} />
    </ScrollView>
  );
}
