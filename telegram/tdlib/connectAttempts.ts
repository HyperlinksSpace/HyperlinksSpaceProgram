import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Client } from "tdl";
import * as tdl from "tdl";
import { getTdjson } from "prebuilt-tdlib";
import { getTdlibDbRoot, getTelegramApiCredentials, getTdlibUserDir } from "./env.js";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../shared/telegramThreadConstants.js";
import { persistMtprotoConnection, readChatAvatarBytes, readUserAvatarBytes, refreshLiveChats, syncChatThreads } from "./syncChats.js";
import { fetchChatHistory } from "./chatHistory.js";
import { attachLiveChatSync, detachLiveChatSync } from "./liveChatSync.js";
import { getLiveChatList, getLiveChatListRevision } from "./liveChatCache.js";

export type ConnectAuthMethod = "qr" | "phone";

export type ConnectAuthState =
  | "initializing"
  | "wait_qr"
  | "wait_phone"
  | "wait_code"
  | "wait_password"
  | "ready"
  | "failed";

export type ConnectCodeDelivery = {
  type: string;
  nextType: string | null;
  timeoutSec: number | null;
  phoneMasked: string | null;
};

export type ConnectAttemptSnapshot = {
  attemptId: string;
  telegramUsername: string;
  authState: ConnectAuthState;
  qrLink: string | null;
  error: string | null;
  chatCount: number | null;
  codeDelivery: ConnectCodeDelivery | null;
};

type AttemptRecord = ConnectAttemptSnapshot & {
  client: Client | null;
  passwordResolve: ((password: string) => void) | null;
  createdAt: number;
  connectionState: string | null;
  qrRequested: boolean;
  authMethod: ConnectAuthMethod;
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

function maskPhoneNumber(phone: string | undefined | null): string | null {
  if (!phone?.trim()) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 4) return trimmed;
  const prefix = trimmed.startsWith("+") ? "+" : "";
  return `${prefix}***${digits.slice(-4)}`;
}

type TdCodeInfo = {
  type?: { _?: string };
  next_type?: { _?: string };
  timeout?: number;
  phone_number?: string;
};

function applyCodeInfo(record: AttemptRecord, codeInfo: TdCodeInfo | undefined): void {
  if (!codeInfo) return;
  record.codeDelivery = {
    type: codeInfo.type?._ ?? "unknown",
    nextType: codeInfo.next_type?._ ?? null,
    timeoutSec: typeof codeInfo.timeout === "number" ? codeInfo.timeout : null,
    phoneMasked: maskPhoneNumber(codeInfo.phone_number),
  };
}

async function syncCodeDeliveryFromClient(record: AttemptRecord): Promise<void> {
  if (!record.client || record.authState !== "wait_code") return;
  try {
    const state = (await record.client.invoke({ _: "getAuthorizationState" })) as {
      _?: string;
      code_info?: TdCodeInfo;
    };
    if (state._ === "authorizationStateWaitCode") {
      applyCodeInfo(record, state.code_info);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logConnectEvent(record, "connect_code_info_sync_failed", { message });
  }
}

function snapshot(record: AttemptRecord): ConnectAttemptSnapshot {
  return {
    attemptId: record.attemptId,
    telegramUsername: record.telegramUsername,
    authState: record.authState,
    qrLink: record.qrLink,
    error: record.error,
    chatCount: record.chatCount,
    codeDelivery: record.codeDelivery,
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

const WATCHDOG_WAIT_STATES: ConnectAuthState[] = [
  "initializing",
  "wait_qr",
  "wait_phone",
  "wait_code",
];

function startConnectWatchdog(record: AttemptRecord): void {
  clearConnectWatchdog(record);
  record.watchdogTimer = setTimeout(() => {
    if (!WATCHDOG_WAIT_STATES.includes(record.authState)) return;
    if (record.qrLink) return;
    if (record.authMethod === "phone" && (record.authState === "wait_phone" || record.authState === "wait_code")) {
      return;
    }
    const stuckConnecting =
      record.connectionState === "connectionStateConnecting" ||
      record.connectionState === "connectionStateWaitingForNetwork";
    if (stuckConnecting || (record.authMethod === "qr" && !record.qrRequested)) {
      failAttempt(record, "telegram_network_unreachable");
    }
  }, CONNECT_WATCHDOG_MS);
}

function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  return `+${digits.replace(/^\+/, "")}`;
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
    if (!attempts.has(record.attemptId)) return;
    logConnectEvent(record, "connect_client_error", { message: err.message });
    failAttempt(record, err.message || "tdlib_client_error");
  });

  client.on("update", (update: { _?: string; authorization_state?: { _?: string; link?: string }; state?: { _?: string } }) => {
    if (!attempts.has(record.attemptId)) return;
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
      if (record.authMethod === "phone" || readStoredAuthMethod(record.telegramUsername) === "phone") {
        record.authMethod = "phone";
        clearConnectWatchdog(record);
        record.authState = "wait_phone";
        logConnectEvent(record, "connect_wait_phone");
      } else {
        void requestQrCode(record);
      }
      return;
    }

    if (state === "authorizationStateWaitCode") {
      clearConnectWatchdog(record);
      record.authMethod = "phone";
      writeStoredAuthMethod(record.telegramUsername, "phone");
      record.authState = "wait_code";
      applyCodeInfo(
        record,
        (update.authorization_state as { code_info?: TdCodeInfo })?.code_info,
      );
      logConnectEvent(record, "connect_wait_code", {
        codeType: record.codeDelivery?.type ?? null,
        nextCodeType: record.codeDelivery?.nextType ?? null,
        codeTimeoutSec: record.codeDelivery?.timeoutSec ?? null,
        phoneMasked: record.codeDelivery?.phoneMasked ?? null,
        codeLength:
          (update.authorization_state as { code_info?: { type?: { length?: number } } })?.code_info
            ?.type?.length ?? null,
      });
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
  clearStoredAuthMethod(record.telegramUsername);
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

async function waitForConnectionReady(record: AttemptRecord, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (record.authState === "failed") return false;
    if (record.connectionState === "connectionStateReady") return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return record.connectionState === "connectionStateReady";
}

export async function purgeTdlibUserData(telegramUsername: string): Promise<void> {
  detachLiveChatSync(telegramUsername);
  const existingId = activeByUser.get(telegramUsername);
  if (existingId) await disposeAttemptAsync(existingId);
  const base = getTdlibUserDir(telegramUsername);
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
  }
  await new Promise((r) => setTimeout(r, 400));
  console.log(
    `[tdlib-gateway] ${JSON.stringify({
      event: "connect_purge_user_data",
      telegramUsername,
    })}`,
  );
}

const AUTH_METHOD_MARKER = "connect-auth-method.json";

function authMethodMarkerPath(telegramUsername: string): string {
  return path.join(getTdlibUserDir(telegramUsername), AUTH_METHOD_MARKER);
}

function readStoredAuthMethod(telegramUsername: string): ConnectAuthMethod | null {
  try {
    const markerPath = authMethodMarkerPath(telegramUsername);
    if (!fs.existsSync(markerPath)) return null;
    const raw = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { authMethod?: string };
    if (raw.authMethod === "phone") return "phone";
    if (raw.authMethod === "qr") return "qr";
    return null;
  } catch {
    return null;
  }
}

function writeStoredAuthMethod(telegramUsername: string, authMethod: ConnectAuthMethod): void {
  const base = getTdlibUserDir(telegramUsername);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(authMethodMarkerPath(telegramUsername), JSON.stringify({ authMethod }));
}

function clearStoredAuthMethod(telegramUsername: string): void {
  const markerPath = authMethodMarkerPath(telegramUsername);
  if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
}

function resolveConnectAuthMethod(
  telegramUsername: string,
  requested: ConnectAuthMethod,
  fresh?: boolean,
): ConnectAuthMethod {
  if (fresh) return requested;
  const stored = readStoredAuthMethod(telegramUsername);
  if (stored === "phone" && requested === "qr") {
    console.log(
      `[tdlib-gateway] ${JSON.stringify({
        event: "connect_auth_method_override",
        telegramUsername,
        requested,
        stored,
      })}`,
    );
    return "phone";
  }
  return requested;
}

const IN_PROGRESS_PHONE_STATES = new Set<ConnectAuthState>([
  "initializing",
  "wait_phone",
  "wait_code",
  "wait_password",
]);

function isInProgressPhoneAttempt(record: AttemptRecord): boolean {
  return record.authMethod === "phone" && IN_PROGRESS_PHONE_STATES.has(record.authState);
}

export async function startConnectAttempt(
  telegramUsername: string,
  options?: { fresh?: boolean; authMethod?: ConnectAuthMethod },
): Promise<ConnectAttemptSnapshot> {
  const authMethod = resolveConnectAuthMethod(
    telegramUsername,
    options?.authMethod === "phone" ? "phone" : "qr",
    options?.fresh,
  );

  if (options?.fresh) {
    await purgeTdlibUserData(telegramUsername);
  } else {
    const existingId = activeByUser.get(telegramUsername);
    if (existingId) {
      const existing = attempts.get(existingId);
      if (
        existing &&
        existing.authState !== "failed" &&
        Date.now() - existing.createdAt < 15 * 60_000
      ) {
        if (isInProgressPhoneAttempt(existing) && authMethod === "qr") {
          return snapshot(existing);
        }
        if (existing.authMethod === authMethod) {
          if (existing.authState === "ready") attachLiveChatSync(existing);
          return snapshot(existing);
        }
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
      codeDelivery: null,
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
    codeDelivery: null,
    client: null,
    passwordResolve: null,
    createdAt: Date.now(),
    connectionState: null,
    qrRequested: false,
    authMethod,
    watchdogTimer: null,
  };

  attempts.set(attemptId, record);
  activeByUser.set(telegramUsername, attemptId);
  if (authMethod === "phone") {
    writeStoredAuthMethod(telegramUsername, "phone");
  }

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

export async function submitConnectPhoneNumber(
  attemptId: string,
  phoneNumber: string,
  options?: { isCurrentPhoneNumber?: boolean },
): Promise<ConnectAttemptSnapshot | null> {
  const record = attempts.get(attemptId);
  if (!record) return null;
  if (!record.client) {
    await waitForAuthState(record, ["wait_phone", "failed"], 45_000);
  }
  if (!record.client) return snapshot(record);
  if (record.authState === "ready") return snapshot(record);
  if (record.authMethod !== "phone") {
    record.error = "wrong_auth_method";
    return snapshot(record);
  }
  if (record.authState === "initializing") {
    await waitForAuthState(record, ["wait_phone", "failed"], 45_000);
  }
  if (record.authState !== "wait_phone") {
    if (record.authState === "wait_code" || record.authState === "wait_password") {
      return snapshot(record);
    }
    record.error = "session_not_ready";
    return snapshot(record);
  }

  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized || normalized.length < 8) {
    record.error = "invalid_phone_number";
    return snapshot(record);
  }

  record.error = null;
  const useCurrentPhone = Boolean(options?.isCurrentPhoneNumber);
  const invokePhone = async (): Promise<void> => {
    await record.client!.invoke({
      _: "setAuthenticationPhoneNumber",
      phone_number: normalized,
      settings: {
        _: "phoneNumberAuthenticationSettings",
        allow_flash_call: false,
        allow_missed_call: false,
        is_current_phone_number: useCurrentPhone,
        has_unknown_phone_number: false,
        allow_sms_retriever_api: false,
        firebase_authentication_settings: null,
        authentication_tokens: [],
      },
    });
  };

  try {
    await waitForConnectionReady(record, 30_000);
    let lastError: Error | null = null;
    for (let tryNum = 0; tryNum < 4; tryNum++) {
      try {
        if (record.authState === "wait_code" || record.authState === "wait_password") {
          lastError = null;
          break;
        }
        await invokePhone();
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (record.authState === "wait_code" || record.authState === "wait_password") {
          lastError = null;
          break;
        }
        const retryable = /another authorization query|call_flood|wait/i.test(lastError.message);
        if (!retryable || tryNum === 3) throw lastError;
        logConnectEvent(record, "connect_phone_retry", {
          message: lastError.message,
          tryNum: tryNum + 1,
        });
        await new Promise((r) => setTimeout(r, 800 * (tryNum + 1)));
        await waitForConnectionReady(record, 15_000);
      }
    }
    await waitForAuthState(record, ["wait_code", "wait_password", "ready", "failed"], 30_000);
    if (record.authState === "wait_code") {
      await syncCodeDeliveryFromClient(record);
      record.error = null;
      logConnectEvent(record, "connect_phone_code_sent", {
        isCurrentPhone: useCurrentPhone,
        codeType: record.codeDelivery?.type ?? null,
        phoneMasked: record.codeDelivery?.phoneMasked ?? null,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "phone_rejected";
    if (record.authState === "wait_code") {
      await syncCodeDeliveryFromClient(record);
      record.error = null;
      logConnectEvent(record, "connect_phone_code_sent_after_error", {
        message,
        codeType: record.codeDelivery?.type ?? null,
        phoneMasked: record.codeDelivery?.phoneMasked ?? null,
      });
      return snapshot(record);
    }
    if (/not found|authorization_closed|session/i.test(message)) {
      record.authState = "failed";
      record.error = "session_expired_restart";
    } else {
      record.authState = "wait_phone";
      record.error = message;
    }
    logConnectEvent(record, "connect_phone_rejected", { message });
  }
  return snapshot(record);
}

export async function resendConnectCode(attemptId: string): Promise<ConnectAttemptSnapshot | null> {
  const record = attempts.get(attemptId);
  if (!record?.client) return record ? snapshot(record) : null;
  if (record.authState !== "wait_code") return snapshot(record);
  record.error = null;
  try {
    await record.client.invoke({ _: "resendAuthenticationCode" });
    await syncCodeDeliveryFromClient(record);
    logConnectEvent(record, "connect_code_resent", {
      codeType: record.codeDelivery?.type ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "resend_failed";
    record.error = message;
    logConnectEvent(record, "connect_code_resend_failed", { message });
  }
  return snapshot(record);
}

export async function submitConnectCode(
  attemptId: string,
  code: string,
): Promise<ConnectAttemptSnapshot | null> {
  const record = attempts.get(attemptId);
  if (!record?.client) return record ? snapshot(record) : null;
  if (record.authState === "ready") return snapshot(record);
  if (record.authMethod !== "phone") {
    record.error = "wrong_auth_method";
    return snapshot(record);
  }

  const trimmed = code.trim();
  if (!trimmed) {
    record.error = "code_required";
    return snapshot(record);
  }

  record.error = null;
  try {
    await record.client.invoke({ _: "checkAuthenticationCode", code: trimmed });
    await waitForAuthState(record, ["wait_password", "ready", "failed"], 30_000);
  } catch (err) {
    const message = err instanceof Error ? err.message : "code_rejected";
    if (/not found|authorization_closed|session/i.test(message)) {
      record.authState = "failed";
      record.error = "session_expired_restart";
    } else {
      record.authState = "wait_code";
      record.error = message;
    }
    logConnectEvent(record, "connect_code_rejected", { message });
  }
  return snapshot(record);
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
  void disposeAttemptAsync(attemptId);
}

async function disposeAttemptAsync(attemptId: string): Promise<void> {
  const record = attempts.get(attemptId);
  if (!record) return;
  detachLiveChatSync(record.telegramUsername);
  clearConnectWatchdog(record);
  attempts.delete(attemptId);
  if (activeByUser.get(record.telegramUsername) === attemptId) {
    activeByUser.delete(record.telegramUsername);
  }
  if (record.client) {
    try {
      await record.client.close();
    } catch {
      /* ignore */
    }
    record.client = null;
  }
  await new Promise((r) => setTimeout(r, 300));
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
export async function resumeExistingSession(
  telegramUsername: string,
  options?: { authMethod?: ConnectAuthMethod },
): Promise<ConnectAttemptSnapshot> {
  const base = getTdlibUserDir(telegramUsername);
  if (!fs.existsSync(path.join(base, "db"))) {
    return {
      attemptId: "",
      telegramUsername,
      authState: "failed",
      qrLink: null,
      error: "no_session",
      chatCount: null,
      codeDelivery: null,
    };
  }
  return startConnectAttempt(telegramUsername, { authMethod: options?.authMethod });
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
      const backfillCount = await refreshLiveChats(record.client, telegramUsername, options.chatIds);
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

export async function getUserAvatarImageForUser(
  telegramUsername: string,
  userId: number,
): Promise<{ data: Buffer; mime: string } | "no_avatar" | null> {
  let record = getActiveRecord(telegramUsername);
  if (!record?.client || record.authState !== "ready") {
    record = await waitForUserSessionReady(telegramUsername, 15_000);
  }
  if (!record?.client || record.authState !== "ready") {
    return null;
  }
  const result = await readUserAvatarBytes(record.client, userId);
  if (result === TELEGRAM_THREAD_NO_AVATAR) return "no_avatar";
  return result;
}

export async function getChatHistoryForUser(
  telegramUsername: string,
  chatId: number,
  limit = 50,
): Promise<{ messages: Awaited<ReturnType<typeof fetchChatHistory>>; error: string | null }> {
  let record = getActiveRecord(telegramUsername);
  if (!record?.client || record.authState !== "ready") {
    record = await waitForUserSessionReady(telegramUsername, 30_000);
  }
  if (!record?.client || record.authState !== "ready") {
    return { messages: [], error: "session_not_ready" };
  }
  try {
    const messages = await fetchChatHistory(record.client, chatId, limit);
    return { messages, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "history_failed";
    return { messages: [], error: message };
  }
}

export function gatewayHealth(): { ok: boolean; tdlibConfigured: boolean; hasApiCredentials: boolean } {
  return {
    ok: true,
    tdlibConfigured: tdlConfigured,
    hasApiCredentials: Boolean(getTelegramApiCredentials()),
  };
}

export { getLiveChatList, getLiveChatListRevision };
