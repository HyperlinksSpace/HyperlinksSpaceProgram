import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildApiUrl } from "../../api/_base";
import { useAuth } from "../../auth/AuthContext";
import { logPageDisplay } from "../pageDisplayLog";
import { TelegramConnectSheet } from "../components/TelegramConnectSheet";
import { getApiBaseUrl } from "../../api/_base";
import { logTelegramConnect } from "./telegramConnectDebug";

export type MtprotoAuthState =
  | "idle"
  | "initializing"
  | "wait_qr"
  | "wait_password"
  | "ready"
  | "failed";

type TelegramMessagesConnectionCtx = {
  isTelegramMessagesConnected: boolean;
  connectPending: boolean;
  connectSheetVisible: boolean;
  connectAuthState: MtprotoAuthState;
  connectQrLink: string | null;
  connectError: string | null;
  openConnectSheet: () => void;
  closeConnectSheet: () => void;
  refreshStatus: () => Promise<void>;
  beginMtprotoConnect: (options?: { fresh?: boolean }) => Promise<void>;
  submitMtprotoPassword: (password: string) => Promise<void>;
  disconnectTelegramMessages: () => Promise<void>;
};

const TelegramMessagesConnectionContext = createContext<TelegramMessagesConnectionCtx | null>(null);

const POLL_MS = 2000;

export function TelegramMessagesConnectionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady, sessionTelegramMessagesConnected } = useAuth();
  const [isTelegramMessagesConnected, setConnected] = useState(false);
  const [connectPending, setConnectPending] = useState(false);
  const [connectSheetVisible, setConnectSheetVisible] = useState(false);
  const [connectAuthState, setConnectAuthState] = useState<MtprotoAuthState>("idle");
  const [connectQrLink, setConnectQrLink] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmupInFlightRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refreshStatusInner = useCallback(async (): Promise<boolean> => {
    logTelegramConnect("refresh_status_start", { isAuthenticated, authReady });
    if (!isAuthenticated) {
      setConnected(false);
      return false;
    }
    const statusUrl = buildApiUrl("/api/telegram-messages-status");
    try {
      const response = await fetch(statusUrl, { method: "GET", credentials: "include" });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; connected?: boolean };
      const connected = response.ok && json.ok === true && json.connected === true;
      setConnected(connected);
      logTelegramConnect("refresh_status_ok", { connected, status: response.status, url: statusUrl });
      logPageDisplay("telegram_messages_status", { connected, status: response.status });
      return connected;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logTelegramConnect("refresh_status_error", { message, url: statusUrl });
      setConnected(false);
      return false;
    }
  }, [isAuthenticated, authReady]);

  const silentWarmupSession = useCallback(async () => {
    if (warmupInFlightRef.current) return;
    warmupInFlightRef.current = true;
    logTelegramConnect("silent_warmup_start");
    try {
      const response = await fetch(buildApiUrl("/api/telegram-messages-warmup"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        connected?: boolean;
        gatewayReady?: boolean;
        needsReconnect?: boolean;
        authState?: string;
        error?: string | null;
      };
      logTelegramConnect("silent_warmup_done", {
        ok: json.ok ?? false,
        gatewayReady: json.gatewayReady ?? false,
        authState: json.authState ?? null,
        error: json.error ?? null,
        status: response.status,
      });
      if (json.needsReconnect || json.connected === false) {
        setConnected(false);
        return;
      }
      if (json.gatewayReady) {
        logPageDisplay("telegram_messages_gateway_ready");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logTelegramConnect("silent_warmup_error", { message });
    } finally {
      warmupInFlightRef.current = false;
    }
  }, []);

  const applyConnectSnapshot = useCallback(
    (json: {
      ok?: boolean;
      authState?: string;
      qrLink?: string | null;
      error?: string | null;
      attemptId?: string | null;
      chatCount?: number | null;
    }) => {
      if (json.attemptId) attemptIdRef.current = json.attemptId;
      const state = json.authState ? (json.authState as MtprotoAuthState) : null;
      if (state) setConnectAuthState(state);
      setConnectQrLink(json.qrLink ?? null);
      setConnectError(json.error ?? (json.ok === false ? "connect_failed" : null));

      if (state === "ready") {
        setConnected(true);
        setConnectSheetVisible(false);
        stopPolling();
        logTelegramConnect("connect_success", { chatCount: json.chatCount ?? null });
        logPageDisplay("telegram_messages_connected");
        void refreshStatusInner();
      } else if (state === "failed") {
        stopPolling();
      }
    },
    [stopPolling, refreshStatusInner],
  );

  const pollConnectStatus = useCallback(async () => {
    const attemptId = attemptIdRef.current;
    if (!attemptId) return;
    const url = buildApiUrl(
      `/api/telegram-mtproto-connect-status?attemptId=${encodeURIComponent(attemptId)}`,
    );
    try {
      const response = await fetch(url, { method: "GET", credentials: "include" });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        authState?: string;
        qrLink?: string | null;
        error?: string | null;
        chatCount?: number | null;
      };
      logTelegramConnect("connect_poll", {
        status: response.status,
        authState: json.authState ?? null,
        error: json.error ?? null,
      });
      applyConnectSnapshot({ ...json, attemptId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logTelegramConnect("connect_poll_error", { message });
    }
  }, [applyConnectSnapshot]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(() => {
      void pollConnectStatus();
    }, POLL_MS);
  }, [pollConnectStatus, stopPolling]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    await refreshStatusInner();
  }, [refreshStatusInner]);

  useEffect(() => {
    logTelegramConnect("provider_mount", { apiBase: getApiBaseUrl(), isAuthenticated, authReady });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setConnected(false);
      return;
    }
    if (sessionTelegramMessagesConnected === true) {
      setConnected(true);
      logTelegramConnect("session_telegram_messages_hydrated", { source: "auth_bootstrap" });
    }
  }, [isAuthenticated, sessionTelegramMessagesConnected]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    void (async () => {
      const connected = await refreshStatusInner();
      if (connected) {
        void silentWarmupSession();
      }
    })();
  }, [authReady, isAuthenticated, refreshStatusInner, silentWarmupSession]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const beginMtprotoConnect = useCallback(async (options?: { fresh?: boolean }) => {
    const startUrl = buildApiUrl("/api/telegram-mtproto-connect-start");
    logTelegramConnect("connect_start", {
      url: startUrl,
      isAuthenticated,
      fresh: Boolean(options?.fresh),
      resume: !options?.fresh,
    });
    setConnectPending(true);
    setConnectError(null);
    setConnectAuthState("initializing");
    setConnectQrLink(null);
    attemptIdRef.current = null;
    try {
      const response = await fetch(startUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options?.fresh ? { fresh: true } : { resume: true }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        attemptId?: string;
        authState?: string;
        qrLink?: string | null;
        error?: string | null;
        chatCount?: number | null;
        debug?: Record<string, unknown>;
      };
      logTelegramConnect("connect_response", {
        status: response.status,
        authState: json.authState ?? null,
        error: json.error ?? null,
        debug: json.debug ?? null,
      });
      applyConnectSnapshot(json);
      if (
        json.attemptId ||
        json.authState === "wait_qr" ||
        json.authState === "initializing" ||
        json.authState === "wait_password"
      ) {
        startPolling();
      }
      if (!response.ok && json.authState !== "wait_qr") {
        setConnectAuthState("failed");
        setConnectError(
          json.error ||
            (response.status === 504 ? "gateway_timeout_retry" : `HTTP_${response.status}`),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnectAuthState("failed");
      setConnectError(message);
      logTelegramConnect("connect_error", { message });
    } finally {
      setConnectPending(false);
      logTelegramConnect("connect_finished");
    }
  }, [applyConnectSnapshot, isAuthenticated, startPolling]);

  const submitMtprotoPassword = useCallback(
    async (password: string) => {
      const attemptId = attemptIdRef.current;
      if (!attemptId || !password.trim()) return;
      setConnectPending(true);
      setConnectError(null);
      try {
        const response = await fetch(buildApiUrl("/api/telegram-mtproto-connect-password"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId, password }),
        });
        const json = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          authState?: string;
          error?: string | null;
          chatCount?: number | null;
        };
        logTelegramConnect("connect_password_response", {
          status: response.status,
          authState: json.authState ?? null,
          error: json.error ?? null,
          ok: json.ok ?? null,
        });
        if (!json.authState) {
          setConnectError(json.error || `HTTP_${response.status}`);
          startPolling();
          return;
        }
        applyConnectSnapshot({ ...json, attemptId });
        if (json.authState !== "ready" && json.authState !== "failed") {
          startPolling();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setConnectError(message.includes("Failed to fetch") ? "network_error" : message);
        logTelegramConnect("connect_password_error", { message });
        startPolling();
      } finally {
        setConnectPending(false);
      }
    },
    [applyConnectSnapshot, startPolling],
  );

  const openConnectSheet = useCallback(() => {
    logTelegramConnect("open_connect_sheet");
    setConnectSheetVisible(true);
    setConnectAuthState("idle");
    setConnectError(null);
    setConnectQrLink(null);
  }, []);

  const closeConnectSheet = useCallback(() => {
    logTelegramConnect("close_connect_sheet");
    stopPolling();
    setConnectSheetVisible(false);
    setConnectAuthState("idle");
    setConnectError(null);
    setConnectQrLink(null);
    attemptIdRef.current = null;
  }, [stopPolling]);

  const disconnectTelegramMessages = useCallback(async () => {
    try {
      await fetch(buildApiUrl("/api/telegram-messages-disconnect"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      /* ignore */
    }
    setConnected(false);
    await refreshStatusInner();
  }, [refreshStatusInner]);

  const value = useMemo(
    (): TelegramMessagesConnectionCtx => ({
      isTelegramMessagesConnected,
      connectPending,
      connectSheetVisible,
      connectAuthState,
      connectQrLink,
      connectError,
      openConnectSheet,
      closeConnectSheet,
      refreshStatus,
      beginMtprotoConnect,
      submitMtprotoPassword,
      disconnectTelegramMessages,
    }),
    [
      isTelegramMessagesConnected,
      connectPending,
      connectSheetVisible,
      connectAuthState,
      connectQrLink,
      connectError,
      openConnectSheet,
      closeConnectSheet,
      refreshStatus,
      beginMtprotoConnect,
      submitMtprotoPassword,
      disconnectTelegramMessages,
    ],
  );

  return (
    <TelegramMessagesConnectionContext.Provider value={value}>
      {children}
      <TelegramConnectSheet />
    </TelegramMessagesConnectionContext.Provider>
  );
}

export function useTelegramMessagesConnection(): TelegramMessagesConnectionCtx {
  const ctx = useContext(TelegramMessagesConnectionContext);
  if (!ctx) {
    throw new Error("useTelegramMessagesConnection must be used within TelegramMessagesConnectionProvider");
  }
  return ctx;
}
