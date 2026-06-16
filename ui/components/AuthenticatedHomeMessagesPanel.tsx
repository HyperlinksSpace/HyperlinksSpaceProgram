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

function chatsChanged(prev: MessageChatRowData[], next: MessageChatRowData[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.title !== b.title ||
      a.subtitle !== b.subtitle ||
      a.last_message_at !== b.last_message_at ||
      a.unread_count !== b.unread_count ||
      a.avatar_url !== b.avatar_url
    ) {
      return true;
    }
  }
  return false;
}

const MESSAGES_POLL_MS = 4_000;
const MESSAGES_RESYNC_MS = 12_000;

export function AuthenticatedHomeMessagesPanel({ colors, scrollable = true }: Props) {
  const { t } = useAppStrings();
  const { authReady, isAuthenticated } = useAuth();
  const { isTelegramMessagesConnected, refreshStatus } = useTelegramMessagesConnection();
  const [chats, setChats] = useState<MessageChatRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarResyncAttemptedRef = useRef(false);
  const lastGatewayResyncRef = useRef(0);
  const pollCountRef = useRef(0);

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
      };
      logPageDisplay("messages_gateway_resync", {
        reason,
        ok: json.ok ?? false,
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
      return response.ok && json.ok !== false;
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
      setChats((prev) => {
        const changed = chatsChanged(prev, rows);
        if (options?.silent) {
          if (changed) {
            logPageDisplay("messages_chats_poll_updated", {
              count: rows.length,
              firstId: rows[0]?.id ?? null,
              poll: pollCountRef.current,
            });
          }
          return changed ? rows : prev;
        }
        return rows;
      });
      if (!options?.silent) {
        logPageDisplay("messages_chats_loaded", { count: rows.length });
      }

      const needsBackfill =
        options?.allowAvatarResync !== false &&
        rows.length > 0 &&
        rows.some((row) => !row.avatar_url || !row.subtitle.trim());
      if (needsBackfill && !avatarResyncAttemptedRef.current) {
        avatarResyncAttemptedRef.current = true;
        logPageDisplay("messages_threads_backfill_start", {
          count: rows.length,
          missingAvatars: rows.filter((row) => !row.avatar_url).length,
          missingSubtitles: rows.filter((row) => !row.subtitle.trim()).length,
        });
        const ok = await triggerGatewayResync("threads_incomplete");
        if (ok) {
          await loadChats({ allowAvatarResync: false, silent: options?.silent });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!options?.silent) {
        logPageDisplay("messages_chats_error", { message });
        setError(message);
        setChats([]);
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [isAuthenticated, isTelegramMessagesConnected, triggerGatewayResync]);

  useEffect(() => {
    if (!authReady) return;
    avatarResyncAttemptedRef.current = false;
    lastGatewayResyncRef.current = 0;
    pollCountRef.current = 0;
    void (async () => {
      await triggerGatewayResync("initial_mount");
      await loadChats();
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
