import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { buildApiUrl } from "../../api/_base";
import { useAuth } from "../../auth/AuthContext";
import { useAppStrings } from "../../locales/AppStringsContext";
import { logPageDisplay } from "../pageDisplayLog";
import type { ThemeColors } from "../theme";
import { useTelegramMessagesConnection } from "../telegram/TelegramMessagesConnectionContext";
import { MessageChatRow, type MessageChatRowData } from "./messages/MessageChatRow";

type Props = {
  colors: ThemeColors;
  scrollable?: boolean;
};

function normalizeChat(raw: unknown): MessageChatRowData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  const title = typeof row.title === "string" ? row.title : "";
  const subtitle = typeof row.subtitle === "string" ? row.subtitle : "";
  const avatarUrl = typeof row.avatar_url === "string" ? row.avatar_url : null;
  const lastAt =
    typeof row.last_message_at === "string" || typeof row.last_message_at === "number"
      ? row.last_message_at
      : null;
  const unread = Number(row.unread_count);
  return {
    id,
    title,
    subtitle,
    avatar_url: avatarUrl,
    last_message_at: lastAt == null ? null : String(lastAt),
    unread_count: Number.isFinite(unread) ? unread : 0,
  };
}

export function AuthenticatedHomeMessagesPanel({ colors, scrollable = true }: Props) {
  const { t } = useAppStrings();
  const { authReady, isAuthenticated } = useAuth();
  const { isTelegramMessagesConnected } = useTelegramMessagesConnection();
  const [chats, setChats] = useState<MessageChatRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarResyncAttemptedRef = useRef(false);

  const loadChats = useCallback(async (options?: { allowAvatarResync?: boolean }) => {
    if (!isAuthenticated || !isTelegramMessagesConnected) {
      setChats([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const url = buildApiUrl("/api/telegram-messages-chats");
    try {
      const response = await fetch(url, { method: "GET", credentials: "include" });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        chats?: unknown[];
        error?: string;
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
      setChats(rows);
      logPageDisplay("messages_chats_loaded", { count: rows.length });

      const needsAvatars =
        options?.allowAvatarResync !== false &&
        rows.length > 0 &&
        rows.every((row) => !row.avatar_url);
      if (needsAvatars && !avatarResyncAttemptedRef.current) {
        avatarResyncAttemptedRef.current = true;
        logPageDisplay("messages_avatars_resync_start", { count: rows.length });
        try {
          const resyncResponse = await fetch(buildApiUrl("/api/telegram-messages-resync"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const resyncJson = (await resyncResponse.json().catch(() => ({}))) as {
            ok?: boolean;
            chatCount?: number;
            error?: string;
          };
          logPageDisplay("messages_avatars_resync_done", {
            ok: resyncJson.ok ?? false,
            chatCount: resyncJson.chatCount ?? null,
            error: resyncJson.error ?? null,
          });
          if (resyncResponse.ok && resyncJson.ok) {
            await loadChats({ allowAvatarResync: false });
          }
        } catch (resyncErr) {
          const message = resyncErr instanceof Error ? resyncErr.message : String(resyncErr);
          logPageDisplay("messages_avatars_resync_error", { message });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logPageDisplay("messages_chats_error", { message });
      setError(message);
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isTelegramMessagesConnected]);

  useEffect(() => {
    if (!authReady) return;
    avatarResyncAttemptedRef.current = false;
    void loadChats();
  }, [authReady, isTelegramMessagesConnected, loadChats]);

  if (!isTelegramMessagesConnected) {
    return (
      <View style={{ width: "100%", paddingVertical: 24, alignItems: "center" }}>
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
      <View style={{ width: "100%", paddingVertical: 24, alignItems: "center" }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (error && chats.length === 0) {
    return (
      <View style={{ width: "100%", paddingVertical: 16 }}>
        <Text style={{ textAlign: "center", color: colors.secondary, fontSize: 15, lineHeight: 20 }}>
          {t("messages.loadError")}
        </Text>
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={{ width: "100%", paddingVertical: 16 }}>
        <Text style={{ textAlign: "center", color: colors.secondary, fontSize: 15, lineHeight: 20 }}>
          {t("messages.empty")}
        </Text>
      </View>
    );
  }

  const list = (
    <View style={{ width: "100%", alignSelf: "stretch" }}>
      {chats.map((item, index) => (
        <MessageChatRow
          key={item.id}
          item={item}
          isLast={index === chats.length - 1}
          colors={colors}
          timePendingLabel={t("feed.timePending")}
        />
      ))}
    </View>
  );

  if (!scrollable) {
    return list;
  }

  return (
    <ScrollView style={{ width: "100%" }} contentContainerStyle={{ flexGrow: 1 }}>
      {list}
    </ScrollView>
  );
}
