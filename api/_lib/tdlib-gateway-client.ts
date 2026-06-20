import { getGatewayBaseUrl, getGatewaySecret } from "../../telegram/tdlib/env.js";
import {
  gatewayHealthCheckDetailed,
  logTdlibGatewayApi,
  type GatewayHealthResult,
} from "./tdlib-gateway-debug.js";

export type GatewayConnectSnapshot = {
  ok?: boolean;
  attemptId?: string;
  telegramUsername?: string;
  authState?: string;
  qrLink?: string | null;
  error?: string | null;
  chatCount?: number | null;
  codeDelivery?: {
    type: string;
    nextType?: string | null;
    timeoutSec?: number | null;
    phoneMasked?: string | null;
  } | null;
};

async function gatewayFetch(
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; json: GatewayConnectSnapshot & Record<string, unknown> }> {
  const base = getGatewayBaseUrl();
  const secret = getGatewaySecret();
  const url = `${base}${path}`;
  const started = Date.now();
  logTdlibGatewayApi("gateway_fetch_start", {
    method: init?.method ?? "GET",
    path,
    gatewayHost: safeHost(url),
  });
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Secret": secret,
        ...(init?.headers ?? {}),
      },
    });
    const json = (await response.json().catch(() => ({}))) as GatewayConnectSnapshot &
      Record<string, unknown>;
    logTdlibGatewayApi("gateway_fetch_done", {
      path,
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - started,
      authState: typeof json.authState === "string" ? json.authState : null,
      error: typeof json.error === "string" ? json.error : null,
    });
    return { response, json };
  } catch (err) {
    logTdlibGatewayApi("gateway_fetch_error", {
      path,
      elapsedMs: Date.now() - started,
      fetchError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function gatewayConnectStart(
  telegramUsername: string,
  options?: { resume?: boolean; fresh?: boolean; resumeOnly?: boolean; authMethod?: "qr" | "phone" },
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/start", {
    method: "POST",
    body: JSON.stringify({
      telegramUsername,
      resume: Boolean(options?.resume),
      fresh: Boolean(options?.fresh),
      resumeOnly: Boolean(options?.resumeOnly),
      authMethod: options?.authMethod === "phone" ? "phone" : "qr",
    }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectStatus(
  attemptId: string,
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch(
    `/v1/connect/status?attemptId=${encodeURIComponent(attemptId)}`,
    { method: "GET" },
  );
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectPassword(
  attemptId: string,
  password: string,
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/password", {
    method: "POST",
    body: JSON.stringify({ attemptId, password }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectPhone(
  attemptId: string,
  phoneNumber: string,
  options?: { isCurrentPhoneNumber?: boolean },
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/phone", {
    method: "POST",
    body: JSON.stringify({
      attemptId,
      phoneNumber,
      isCurrentPhoneNumber: Boolean(options?.isCurrentPhoneNumber),
    }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectResendCode(
  attemptId: string,
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/code/resend", {
    method: "POST",
    body: JSON.stringify({ attemptId }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectCode(
  attemptId: string,
  code: string,
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/code", {
    method: "POST",
    body: JSON.stringify({ attemptId, code }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayResyncChats(
  telegramUsername: string,
  options?: { chatIds?: number[] },
): Promise<{
  ok: boolean;
  chatCount?: number;
  backfillCount?: number;
  error?: string;
  httpStatus: number;
}> {
  const { response, json } = await gatewayFetch("/v1/connect/resync", {
    method: "POST",
    body: JSON.stringify({
      telegramUsername,
      ...(options?.chatIds?.length ? { chatIds: options.chatIds } : {}),
    }),
  });
  return {
    ok: response.ok && json.ok !== false,
    chatCount: typeof json.chatCount === "number" ? json.chatCount : undefined,
    backfillCount: typeof json.backfillCount === "number" ? json.backfillCount : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    httpStatus: response.status,
  };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resume TDLib from on-disk session on the gateway (no QR). Polls until ready or timeout. */
export async function gatewayWarmupSession(
  telegramUsername: string,
  options?: { maxPollMs?: number; pollMs?: number },
): Promise<{ ok: boolean; authState: string; error?: string }> {
  const maxPollMs = options?.maxPollMs ?? 45_000;
  const pollMs = options?.pollMs ?? 2_000;

  const start = await gatewayConnectStart(telegramUsername, { resume: true, resumeOnly: true });
  if (start.authState === "ready") {
    return { ok: true, authState: "ready" };
  }
  if (start.error === "no_session" || (start.authState === "failed" && !start.attemptId)) {
    return { ok: false, authState: "failed", error: start.error ?? "no_session" };
  }

  const attemptId = start.attemptId;
  if (!attemptId) {
    return {
      ok: false,
      authState: start.authState ?? "failed",
      error: start.error ?? "warmup_no_attempt",
    };
  }

  const deadline = Date.now() + maxPollMs;
  while (Date.now() < deadline) {
    await sleepMs(pollMs);
    const snap = await gatewayConnectStatus(attemptId);
    if (snap.authState === "ready") {
      return { ok: true, authState: "ready" };
    }
    if (snap.authState === "failed") {
      return { ok: false, authState: "failed", error: snap.error ?? "warmup_failed" };
    }
  }

  return { ok: false, authState: "session_not_ready", error: "warmup_timeout" };
}

export async function gatewayFetchLiveChats(
  telegramUsername: string,
): Promise<{ chats: Record<string, unknown>[]; revision: number } | null> {
  const base = getGatewayBaseUrl();
  const secret = getGatewaySecret();
  const params = new URLSearchParams({ telegramUsername });
  const url = `${base}/v1/chats/list?${params.toString()}`;
  const started = Date.now();
  logTdlibGatewayApi("gateway_fetch_start", {
    method: "GET",
    path: "/v1/chats/list",
    gatewayHost: safeHost(url),
  });
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Gateway-Secret": secret },
    });
    if (!response.ok) {
      logTdlibGatewayApi("gateway_fetch_done", {
        path: "/v1/chats/list",
        status: response.status,
        ok: false,
        elapsedMs: Date.now() - started,
      });
      return null;
    }
    const json = (await response.json()) as {
      ok?: boolean;
      chats?: Record<string, unknown>[];
      revision?: number;
    };
    if (!Array.isArray(json.chats)) {
      logTdlibGatewayApi("gateway_fetch_done", {
        path: "/v1/chats/list",
        status: response.status,
        ok: true,
        elapsedMs: Date.now() - started,
        parseError: "chats_not_array",
      });
      return null;
    }
    logTdlibGatewayApi("gateway_fetch_done", {
      path: "/v1/chats/list",
      status: response.status,
      ok: true,
      elapsedMs: Date.now() - started,
      revision: Number(json.revision) || 0,
      count: json.chats.length,
    });
    return { chats: json.chats, revision: Number(json.revision) || 0 };
  } catch (err) {
    logTdlibGatewayApi("gateway_fetch_error", {
      path: "/v1/chats/list",
      elapsedMs: Date.now() - started,
      fetchError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    return null;
  }
}

export async function gatewayFetchChatMessages(
  telegramUsername: string,
  chatId: number,
  limit = 50,
): Promise<{ messages: Record<string, unknown>[]; error: string | null }> {
  const base = getGatewayBaseUrl();
  const secret = getGatewaySecret();
  const url = `${base}/v1/chat/messages?telegramUsername=${encodeURIComponent(telegramUsername)}&chatId=${encodeURIComponent(String(chatId))}&limit=${encodeURIComponent(String(limit))}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Gateway-Secret": secret },
    });
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      messages?: Record<string, unknown>[];
      error?: string;
    };
    if (!response.ok || !json.ok) {
      return { messages: [], error: json.error ?? "history_unavailable" };
    }
    return { messages: Array.isArray(json.messages) ? json.messages : [], error: null };
  } catch (err) {
    return {
      messages: [],
      error: err instanceof Error ? err.message : "gateway_unreachable",
    };
  }
}

export async function gatewayFetchUserAvatar(
  telegramUsername: string,
  userId: number,
): Promise<{ data: ArrayBuffer; mime: string } | "no_avatar" | null> {
  const base = getGatewayBaseUrl();
  const secret = getGatewaySecret();
  const url = `${base}/v1/user/avatar?telegramUsername=${encodeURIComponent(telegramUsername)}&userId=${encodeURIComponent(String(userId))}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Gateway-Secret": secret },
    });
    logTdlibGatewayApi("gateway_fetch_done", {
      path: "/v1/user/avatar",
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - started,
      userId,
    });
    if (response.status === 404) return "no_avatar";
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") ?? "image/jpeg";
    return { data: await response.arrayBuffer(), mime };
  } catch (err) {
    logTdlibGatewayApi("gateway_fetch_error", {
      path: "/v1/user/avatar",
      elapsedMs: Date.now() - started,
      fetchError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      userId,
    });
    return null;
  }
}

export async function gatewayFetchChatAvatar(
  telegramUsername: string,
  chatId: number,
): Promise<{ data: ArrayBuffer; mime: string } | "no_avatar" | null> {
  const base = getGatewayBaseUrl();
  const secret = getGatewaySecret();
  const params = new URLSearchParams({
    telegramUsername,
    chatId: String(chatId),
  });
  const url = `${base}/v1/chat/avatar?${params.toString()}`;
  const started = Date.now();
  logTdlibGatewayApi("gateway_fetch_start", {
    method: "GET",
    path: "/v1/chat/avatar",
    gatewayHost: safeHost(url),
    chatId,
  });
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Gateway-Secret": secret },
    });
    logTdlibGatewayApi("gateway_fetch_done", {
      path: "/v1/chat/avatar",
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - started,
      chatId,
    });
    if (response.status === 404) return "no_avatar";
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") ?? "image/jpeg";
    return { data: await response.arrayBuffer(), mime };
  } catch (err) {
    logTdlibGatewayApi("gateway_fetch_error", {
      path: "/v1/chat/avatar",
      elapsedMs: Date.now() - started,
      fetchError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      chatId,
    });
    return null;
  }
}

export async function gatewayDisconnect(telegramUsername: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { response, json } = await gatewayFetch("/v1/disconnect", {
      method: "POST",
      body: JSON.stringify({ telegramUsername }),
    });
    return { ok: response.ok && json.ok !== false, error: typeof json.error === "string" ? json.error : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "gateway_unreachable" };
  }
}

export async function gatewayHealthCheck(): Promise<boolean> {
  const result = await gatewayHealthCheckDetailed();
  return result.ok;
}

export { gatewayHealthCheckDetailed, type GatewayHealthResult };

export function gatewayNotConfiguredResponse(): GatewayConnectSnapshot {
  return {
    authState: "failed",
    error: "tdlib_gateway_not_configured",
    qrLink: null,
    chatCount: null,
  };
}
