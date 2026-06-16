import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Client } from "tdl";
import * as tdl from "tdl";
import { getTdjson } from "prebuilt-tdlib";
import { getTdlibDbRoot, getTelegramApiCredentials, getTdlibUserDir } from "./env.js";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../shared/telegramThreadConstants.js";
import { backfillChatThreads, persistMtprotoConnection, readChatAvatarBytes, syncChatThreads } from "./syncChats.js";
import { attachLiveChatSync, detachLiveChatSync } from "./liveChatSync.js";

export type ConnectAuthState =
  | "initializing"
  | "wait_qr"
  | "wait_password"
  | "ready"
  | "failed";

export type ConnectAttemptSnapshot = {
  attemptId: string;
  telegramUsername: string;
  authState: ConnectAuthState;
  qrLink: string | null;
  error: string | null;
  chatCount: number | null;
};

type AttemptRecord = ConnectAttemptSnapshot & {
  client: Client | null;
  passwordResolve: ((password: string) => void) | null;
  createdAt: number;
  connectionState: string | null;
  qrRequested: boolean;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
};

let tdlConfigured = false;

function ensureTdlConfigured(): void {
  if (tdlConfigured) return;
  tdl.configure({ tdjson: getTdjson() });
  tdlConfigured = true;
}

function ensureUserDirs(telegramUsername: string): { databaseDirectory: string; filesDirectory: string } {
  const base = getTdlibUserDir(telegramUsername);
  const databaseDirectory = path.join(base, "db");
  const filesDirectory = path.join(base, "files");
  fs.mkdirSync(databaseDirectory, { recursive: true });
  fs.mkdirSync(filesDirectory, { recursive: true });
  return { databaseDirectory, filesDirectory };
}

function createTdlibClient(telegramUsername: string, hook?: (client: Client) => void): Client {
  const creds = getTelegramApiCredentials();
  if (!creds) {
    throw new Error("telegram_api_credentials_missing");
  }
  ensureTdlConfigured();
  const { databaseDirectory, filesDirectory } = ensureUserDirs(telegramUsername);
  const client = tdl.createClient({
    apiId: creds.apiId,
    apiHash: creds.apiHash,
    databaseDirectory,
    filesDirectory,
    useTestDc: false,
  });
  hook?.(client);
  return client;
}

const attempts = new Map<string, AttemptRecord>();
const activeByUser = new Map<string, string>();

function snapshot(record: AttemptRecord): ConnectAttemptSnapshot {
  return {
    attemptId: record.attemptId,
    telegramUsername: record.telegramUsername,
    authState: record.authState,
    qrLink: record.qrLink,
    error: record.error,
    chatCount: record.chatCount,
  };
}

function logConnectEvent(record: AttemptRecord, event: string, extra?: Record<string, unknown>): void {
  console.log(
    `[tdlib-gateway] ${JSON.stringify({
      event,
      attemptId: record.attemptId,
      telegramUsername: record.telegramUsername,
      authState: record.authState,
      connectionState: record.connectionState,
      ...extra,
    })}`,
  );
}

const QR_INVOKE_TIMEOUT_MS = 30_000;
const CONNECT_WATCHDOG_MS = 45_000;

function failAttempt(record: AttemptRecord, error: string): void {
  if (record.authState === "ready" || record.authState === "failed") return;
  record.authState = "failed";
  record.error = error;
  clearConnectWatchdog(record);
  logConnectEvent(record, "connect_failed", { error });
}

function clearConnectWatchdog(record: AttemptRecord): void {
  if (record.watchdogTimer) {
    clearTimeout(record.watchdogTimer);
    record.watchdogTimer = null;
  }
}

function startConnectWatchdog(record: AttemptRecord): void {
  clearConnectWatchdog(record);
  record.watchdogTimer = setTimeout(() => {
    if (record.authState !== "initializing" && record.authState !== "wait_qr") return;
    if (record.qrLink) return;
    const stuckConnecting =
      record.connectionState === "connectionStateConnecting" ||
      record.connectionState === "connectionStateWaitingForNetwork";
    if (stuckConnecting || !record.qrRequested) {
      failAttempt(record, "telegram_network_unreachable");
    }
  }, CONNECT_WATCHDOG_MS);
}

async function requestQrCode(record: AttemptRecord): Promise<void> {
  const client = record.client;
  if (!client || record.qrRequested) return;
  record.qrRequested = true;
  logConnectEvent(record, "connect_qr_request");
  try {
    await Promise.race([
      client.invoke({ _: "requestQrCodeAuthentication", other_user_ids: [] }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("telegram_network_unreachable")), QR_INVOKE_TIMEOUT_MS);
      }),
    ]);
    logConnectEvent(record, "connect_qr_request_ok");
  } catch (err) {
    failAttempt(record, err instanceof Error ? err.message : "qr_request_failed");
  }
}

function attachAuthListener(record: AttemptRecord): void {
  const client = record.client;
  if (!client) return;

  client.on("error", (err: Error) => {
    logConnectEvent(record, "connect_client_error", { message: err.message });
    failAttempt(record, err.message || "tdlib_client_error");
  });

  client.on("update", (update: { _?: string; authorization_state?: { _?: string; link?: string }; state?: { _?: string } }) => {
    if (update._ === "updateConnectionState") {
      record.connectionState = update.state?._ ?? null;
      logConnectEvent(record, "connect_connection_state", { connectionState: record.connectionState });
      return;
    }

    if (update._ !== "updateAuthorizationState") return;
    const state = update.authorization_state?._;
    if (!state) return;
    logConnectEvent(record, "connect_auth_state", { tdlibAuthState: state });

    if (state === "authorizationStateWaitPhoneNumber") {
      void requestQrCode(record);
      return;
    }

    if (state === "authorizationStateWaitOtherDeviceConfirmation") {
      clearConnectWatchdog(record);
      record.authState = "wait_qr";
      record.qrLink = update.authorization_state?.link ?? null;
      logConnectEvent(record, "connect_qr_ready", { hasQrLink: Boolean(record.qrLink) });
      return;
    }

    if (state === "authorizationStateWaitPassword") {
      clearConnectWatchdog(record);
      record.authState = "wait_password";
      return;
    }

    if (state === "authorizationStateReady") {
      clearConnectWatchdog(record);
      void finalizeReady(record);
    }

    if (state === "authorizationStateClosed") {
      failAttempt(record, "authorization_closed");
    }
  });
}

async function finalizeReady(record: AttemptRecord): Promise<void> {
  if (record.authState === "ready") return;
  const client = record.client;
  if (!client) {
    record.authState = "failed";
    record.error = "client_missing";
    return;
  }

  try {
    await persistMtprotoConnection(client, record.telegramUsername);
    logConnectEvent(record, "connect_session_persisted");
  } catch (err) {
    const message = err instanceof Error ? err.message : "session_persist_failed";
    record.authState = "failed";
    record.error = message;
    logConnectEvent(record, "connect_persist_failed", { message });
    return;
  }

  try {
    record.chatCount = await syncChatThreads(client, record.telegramUsername);
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    logConnectEvent(record, "connect_sync_warning", { message });
    record.chatCount = 0;
  }

  record.authState = "ready";
  record.qrLink = null;
  record.error = null;
  attachLiveChatSync(record);
  logConnectEvent(record, "connect_ready", { chatCount: record.chatCount ?? 0 });
}

async function waitForAuthState(
  record: AttemptRecord,
  targets: ConnectAuthState[],
  timeoutMs: number,
): Promise<ConnectAuthState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (targets.includes(record.authState)) return record.authState;
    if (record.authState === "failed") return record.authState;
    await new Promise((r) => setTimeout(r, 250));
  }
  return record.authState;
}

export function purgeTdlibUserData(telegramUsername: string): void {
  detachLiveChatSync(telegramUsername);
  const existingId = activeByUser.get(telegramUsername);
  if (existingId) disposeAttempt(existingId);
  const base = getTdlibUserDir(telegramUsername);
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
  }
  console.log(
    `[tdlib-gateway] ${JSON.stringify({
      event: "connect_purge_user_data",
      telegramUsername,
    })}`,
  );
}

export async function startConnectAttempt(
  telegramUsername: string,
  options?: { fresh?: boolean },
): Promise<ConnectAttemptSnapshot> {
  if (options?.fresh) {
    purgeTdlibUserData(telegramUsername);
  } else {
    const existingId = activeByUser.get(telegramUsername);
    if (existingId) {
      const existing = attempts.get(existingId);
      if (existing && existing.authState !== "failed" && Date.now() - existing.createdAt < 15 * 60_000) {
        if (existing.authState === "ready") attachLiveChatSync(existing);
        return snapshot(existing);
      }
      disposeAttempt(existingId);
    }
  }

  if (!getTelegramApiCredentials()) {
    return {
      attemptId: "",
      telegramUsername,
      authState: "failed",
      qrLink: null,
      error: "telegram_api_credentials_missing",
      chatCount: null,
    };
  }

  const attemptId = randomUUID();
  const record: AttemptRecord = {
    attemptId,
    telegramUsername,
    authState: "initializing",
    qrLink: null,
    error: null,
    chatCount: null,
    client: null,
    passwordResolve: null,
    createdAt: Date.now(),
    connectionState: null,
    qrRequested: false,
    watchdogTimer: null,
  };

  attempts.set(attemptId, record);
  activeByUser.set(telegramUsername, attemptId);

  try {
    const client = createTdlibClient(telegramUsername, (created) => {
      record.client = created;
      attachAuthListener(record);
    });
    record.client = client;
    startConnectWatchdog(record);
    // Return immediately; auth listener + client poll pick up QR / password / ready.
    return snapshot(record);
  } catch (err) {
    record.authState = "failed";
    record.error = err instanceof Error ? err.message : "connect_failed";
    return snapshot(record);
  }
}

export function getConnectAttempt(attemptId: string): ConnectAttemptSnapshot | null {
  const record = attempts.get(attemptId);
  return record ? snapshot(record) : null;
}

export async function submitConnectPassword(
  attemptId: string,
  password: string,
): Promise<ConnectAttemptSnapshot | null> {
  const record = attempts.get(attemptId);
  if (!record?.client) return record ? snapshot(record) : null;
  if (record.authState === "ready") return snapshot(record);

  try {
    await record.client.invoke({ _: "checkAuthenticationPassword", password });
    await waitForAuthState(record, ["ready", "failed"], 30_000);
  } catch (err) {
    const message = err instanceof Error ? err.message : "password_rejected";
    if (/not found|authorization_closed|session/i.test(message)) {
      record.authState = "failed";
      record.error = "session_expired_restart";
    } else {
      record.authState = "wait_password";
      record.error = message;
    }
    logConnectEvent(record, "connect_password_rejected", { message });
  }
  return snapshot(record);
}

export function disposeAttempt(attemptId: string): void {
  const record = attempts.get(attemptId);
  if (!record) return;
  detachLiveChatSync(record.telegramUsername);
  clearConnectWatchdog(record);
  if (record.client) {
    try {
      record.client.close();
    } catch {
      /* ignore */
    }
  }
  attempts.delete(attemptId);
  if (activeByUser.get(record.telegramUsername) === attemptId) {
    activeByUser.delete(record.telegramUsername);
  }
}

export async function disconnectUserSession(telegramUsername: string): Promise<void> {
  const attemptId = activeByUser.get(telegramUsername);
  if (attemptId) disposeAttempt(attemptId);

  const base = getTdlibUserDir(telegramUsername);
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

function getActiveRecord(telegramUsername: string): AttemptRecord | null {
  const attemptId = activeByUser.get(telegramUsername);
  if (!attemptId) return null;
  return attempts.get(attemptId) ?? null;
}

async function waitForUserSessionReady(
  telegramUsername: string,
  timeoutMs: number,
): Promise<AttemptRecord | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = getActiveRecord(telegramUsername);
    if (record?.client && record.authState === "ready") return record;
    if (record?.authState === "failed") return record;
    await new Promise((r) => setTimeout(r, 250));
  }
  return getActiveRecord(telegramUsername);
}

/** Resume an existing on-disk TDLib session (fast — client polls for QR/ready). */
export async function resumeExistingSession(telegramUsername: string): Promise<ConnectAttemptSnapshot> {
  const base = getTdlibUserDir(telegramUsername);
  if (!fs.existsSync(path.join(base, "db"))) {
    return {
      attemptId: "",
      telegramUsername,
      authState: "failed",
      qrLink: null,
      error: "no_session",
      chatCount: null,
    };
  }
  return startConnectAttempt(telegramUsername);
}

/** Re-sync chat list + avatars for an already-authorized user (no QR). */
export async function resyncUserChats(
  telegramUsername: string,
  options?: { chatIds?: number[] },
): Promise<{ chatCount: number; backfillCount: number; error: string | null }> {
  console.log(
    `[tdlib-gateway] ${JSON.stringify({
      event: "connect_resync_start",
      telegramUsername,
      hasActiveRecord: Boolean(getActiveRecord(telegramUsername)),
      backfillOnly: Boolean(options?.chatIds?.length),
      backfillTargets: options?.chatIds?.length ?? 0,
    })}`,
  );

  let record = getActiveRecord(telegramUsername);
  if (!record?.client || record.authState !== "ready") {
    const base = getTdlibUserDir(telegramUsername);
    if (!fs.existsSync(path.join(base, "db"))) {
      console.log(
        `[tdlib-gateway] ${JSON.stringify({
          event: "connect_resync_no_session",
          telegramUsername,
        })}`,
      );
      return { chatCount: 0, backfillCount: 0, error: "no_session" };
    }
    await startConnectAttempt(telegramUsername);
    record = await waitForUserSessionReady(telegramUsername, 60_000);
  }

  if (!record?.client || record.authState !== "ready") {
    const error = record?.error ?? "session_not_ready";
    console.log(
      `[tdlib-gateway] ${JSON.stringify({
        event: "connect_resync_not_ready",
        telegramUsername,
        authState: record?.authState ?? null,
        error,
      })}`,
    );
    return { chatCount: 0, backfillCount: 0, error };
  }

  attachLiveChatSync(record);
  try {
    if (options?.chatIds?.length) {
      const backfillCount = await backfillChatThreads(record.client, telegramUsername, options.chatIds);
      logConnectEvent(record, "connect_backfill_ok", { backfillCount });
      return { chatCount: record.chatCount ?? 0, backfillCount, error: null };
    }

    const count = await syncChatThreads(record.client, telegramUsername);
    record.chatCount = count;
    logConnectEvent(record, "connect_resync_ok", { chatCount: count });
    return { chatCount: count, backfillCount: 0, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    logConnectEvent(record, "connect_resync_failed", { message });
    return { chatCount: 0, backfillCount: 0, error: message };
  }
}

/** After gateway restart, reload TDLib sessions from disk so live updates resume. */
export function restorePersistedGatewaySessions(): void {
  const root = getTdlibDbRoot();
  if (!fs.existsSync(root)) return;

  const usernames: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dbPath = path.join(root, entry.name, "db");
    if (fs.existsSync(dbPath)) usernames.push(entry.name);
  }

  if (usernames.length === 0) return;

  console.log(
    `[tdlib-gateway] ${JSON.stringify({
      event: "connect_restore_sessions_start",
      count: usernames.length,
    })}`,
  );

  for (const telegramUsername of usernames) {
    void (async () => {
      try {
        const result = await resyncUserChats(telegramUsername);
        console.log(
          `[tdlib-gateway] ${JSON.stringify({
            event: "connect_restore_session_done",
            telegramUsername,
            chatCount: result.chatCount,
            error: result.error,
          })}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[tdlib-gateway] ${JSON.stringify({
            event: "connect_restore_session_error",
            telegramUsername,
            message,
          })}`,
        );
      }
    })();
  }
}

export async function getChatAvatarImageForUser(
  telegramUsername: string,
  chatId: number,
): Promise<{ data: Buffer; mime: string } | "no_avatar" | null> {
  let record = getActiveRecord(telegramUsername);
  if (!record?.client || record.authState !== "ready") {
    record = await waitForUserSessionReady(telegramUsername, 15_000);
  }
  if (!record?.client || record.authState !== "ready") {
    return null;
  }
  const result = await readChatAvatarBytes(record.client, chatId);
  if (result === TELEGRAM_THREAD_NO_AVATAR) return "no_avatar";
  return result;
}

export function gatewayHealth(): { ok: boolean; tdlibConfigured: boolean; hasApiCredentials: boolean } {
  return {
    ok: true,
    tdlibConfigured: tdlConfigured,
    hasApiCredentials: Boolean(getTelegramApiCredentials()),
  };
}
