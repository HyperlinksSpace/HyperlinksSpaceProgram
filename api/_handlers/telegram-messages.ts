import {
  disconnectTelegramMessages,
  getConnection,
  isTelegramMessagesConnected,
} from "../../database/telegramMessages.js";
import { revokeMtprotoSession } from "../../database/telegramMtproto.js";
import { applyAuthApiCors, authApiPreflightResponse } from "../_lib/auth-cors.js";
import { telegramUsernameFromSessionCookie } from "../_lib/session-auth.js";
import { gatewayDisconnect, gatewayFetchChatAvatar, gatewayFetchLiveChats, gatewayResyncChats, gatewayWarmupSession } from "../_lib/tdlib-gateway-client.js";

type NodeRes = {
  status: (code: number) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string | Buffer) => void;
};

type AnyRequest = Request | { method?: string; headers?: Record<string, string | string[] | undefined>; url?: string };

const JSON_HEADERS = { "Content-Type": "application/json" };
const TELEGRAM_MESSAGES_API_LOG_PREFIX = "[telegram-messages-api]";

function logTelegramMessagesApi(event: string, details?: Record<string, unknown>): void {
  const payload = details ? { event, ...details } : { event };
  try {
    console.log(`${TELEGRAM_MESSAGES_API_LOG_PREFIX} ${JSON.stringify(payload)}`);
  } catch {
    console.log(TELEGRAM_MESSAGES_API_LOG_PREFIX, event, details ?? "");
  }
}

function requestMethod(request: AnyRequest): string {
  return ((request as { method?: string }).method ?? (request as Request).method ?? "GET").toUpperCase();
}

function sendJson(body: object, status = 200, request?: AnyRequest): Response {
  const headers = new Headers(JSON_HEADERS);
  if (request) applyAuthApiCors(request, headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function sendJsonViaRes(res: NodeRes, body: object, status = 200, request?: AnyRequest): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  if (request) {
    const headers = new Headers();
    applyAuthApiCors(request, headers);
    headers.forEach((v, k) => res.setHeader(k, v));
  }
  res.end(JSON.stringify(body));
}

function finishPreflight(request: AnyRequest, res: NodeRes | undefined, preflight: Response): Response | void {
  if (res) {
    res.status(preflight.status);
    preflight.headers.forEach((v, k) => res.setHeader(k, v));
    res.end();
    return;
  }
  return preflight;
}

function finishJson(
  request: AnyRequest,
  res: NodeRes | undefined,
  body: object,
  status = 200,
): Response | void {
  if (res) {
    sendJsonViaRes(res, body, status, request);
    return;
  }
  return sendJson(body, status, request);
}

async function requireUser(request: AnyRequest): Promise<string | Response> {
  const username = await telegramUsernameFromSessionCookie(request);
  if (!username) {
    return sendJson({ ok: false, error: "unauthorized" }, 401, request);
  }
  return username;
}

function mapLiveChats(live: { chats: Record<string, unknown>[]; revision: number }) {
  const chats = live.chats.map((row) => ({
    id: row.telegram_chat_id,
    telegram_chat_id: row.telegram_chat_id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    avatar_url: row.avatar_url ?? null,
    last_message_at: row.last_message_at,
    unread_count: row.unread_count ?? 0,
  }));
  return { chats, revision: live.revision };
}

export async function telegramMessagesStatusHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  if (requestMethod(request) !== "GET") {
    return finishJson(request, res, { ok: false, error: "method_not_allowed" }, 405);
  }

  const userOrRes = await requireUser(request);
  if (userOrRes instanceof Response) {
    if (res) {
      res.status(userOrRes.status);
      userOrRes.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await userOrRes.text());
      return;
    }
    return userOrRes;
  }

  const connected = await isTelegramMessagesConnected(userOrRes);
  const conn = connected ? await getConnection(userOrRes) : null;
  return finishJson(
    request,
    res,
    {
      ok: true,
      connected,
      connected_at: conn?.connected_at ?? null,
    },
    200,
  );
}

export async function telegramMessagesConnectHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  return finishJson(
    request,
    res,
    {
      ok: false,
      error: "use_mtproto_connect_start",
      hint: "POST /api/telegram-mtproto-connect-start",
    },
    410,
  );
}

export async function telegramMessagesDisconnectHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  if (requestMethod(request) !== "POST") {
    return finishJson(request, res, { ok: false, error: "method_not_allowed" }, 405);
  }

  const userOrRes = await requireUser(request);
  if (userOrRes instanceof Response) {
    if (res) {
      res.status(userOrRes.status);
      userOrRes.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await userOrRes.text());
      return;
    }
    return userOrRes;
  }

  await gatewayDisconnect(userOrRes);
  await revokeMtprotoSession(userOrRes);
  await disconnectTelegramMessages(userOrRes);
  return finishJson(request, res, { ok: true, connected: false }, 200);
}

export async function telegramMessagesChatsHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  if (requestMethod(request) !== "GET") {
    return finishJson(request, res, { ok: false, error: "method_not_allowed" }, 405);
  }

  const userOrRes = await requireUser(request);
  if (userOrRes instanceof Response) {
    if (res) {
      res.status(userOrRes.status);
      userOrRes.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await userOrRes.text());
      return;
    }
    return userOrRes;
  }

  const connected = await isTelegramMessagesConnected(userOrRes);
  if (!connected) {
    logTelegramMessagesApi("messages_chats_not_connected", {
      telegramUsername: userOrRes,
    });
    return finishJson(request, res, { ok: false, error: "not_connected", connected: false }, 403);
  }

  const started = Date.now();
  const live = await gatewayFetchLiveChats(userOrRes);
  const mapped = live ? mapLiveChats(live) : { chats: [], revision: 0 };
  const missingPreviewCount = mapped.chats.filter(
    (row) => typeof row.subtitle !== "string" || row.subtitle.trim().length === 0,
  ).length;
  const missingAvatarCount = mapped.chats.filter((row) => !row.avatar_url).length;
  logTelegramMessagesApi("messages_chats_served", {
    telegramUsername: userOrRes,
    count: mapped.chats.length,
    revision: mapped.revision,
    source: live ? "live" : "live_empty",
    missingPreviewCount,
    missingAvatarCount,
    elapsedMs: Date.now() - started,
  });
  return finishJson(
    request,
    res,
    {
      ok: true,
      connected: true,
      source: "live",
      revision: mapped.revision,
      chats: mapped.chats,
    },
    200,
  );
}

export async function telegramMessagesResyncHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  if (requestMethod(request) !== "POST") {
    return finishJson(request, res, { ok: false, error: "method_not_allowed" }, 405);
  }

  const userOrRes = await requireUser(request);
  if (userOrRes instanceof Response) {
    if (res) {
      res.status(userOrRes.status);
      userOrRes.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await userOrRes.text());
      return;
    }
    return userOrRes;
  }

  const connected = await isTelegramMessagesConnected(userOrRes);
  if (!connected) {
    return finishJson(request, res, { ok: false, error: "not_connected", connected: false }, 403);
  }

  let result = await gatewayResyncChats(userOrRes);

  if (result.error === "no_session" || result.error === "session_not_ready") {
    const warm = await gatewayWarmupSession(userOrRes, { maxPollMs: 25_000 });
    if (warm.ok) {
      result = await gatewayResyncChats(userOrRes);
    } else if (result.error === "session_not_ready" || warm.error === "warmup_timeout") {
      return finishJson(request, res, {
        ok: false,
        connected: true,
        warming: true,
        chatCount: result.chatCount ?? 0,
        error: result.error ?? warm.error ?? "session_not_ready",
      });
    }
  }

  const sessionLost = result.error === "no_session";
  if (sessionLost) {
    await revokeMtprotoSession(userOrRes);
    await disconnectTelegramMessages(userOrRes);
    return finishJson(request, res, {
      ok: false,
      connected: false,
      needsReconnect: true,
      chatCount: 0,
      error: result.error ?? "no_session",
    });
  }

  return finishJson(
    request,
    res,
    {
      ok: result.ok,
      connected: true,
      chatCount: result.chatCount ?? 0,
      error: result.error ?? null,
    },
    result.httpStatus >= 400 ? result.httpStatus : 200,
  );
}

function requestUrl(request: AnyRequest): URL | null {
  const raw = (request as { url?: string }).url ?? (request as Request).url;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export async function telegramMessagesAvatarHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  if (requestMethod(request) !== "GET") {
    return finishJson(request, res, { ok: false, error: "method_not_allowed" }, 405);
  }

  const userOrRes = await requireUser(request);
  if (userOrRes instanceof Response) {
    if (res) {
      res.status(userOrRes.status);
      userOrRes.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await userOrRes.text());
      return;
    }
    return userOrRes;
  }

  const connected = await isTelegramMessagesConnected(userOrRes);
  if (!connected) {
    logTelegramMessagesApi("messages_avatar_not_connected", {
      telegramUsername: userOrRes,
    });
    return finishJson(request, res, { ok: false, error: "not_connected" }, 403);
  }

  const url = requestUrl(request);
  const chatId = Number(url?.searchParams.get("chat_id"));
  if (!Number.isFinite(chatId)) {
    logTelegramMessagesApi("messages_avatar_bad_request", {
      telegramUsername: userOrRes,
      chatIdRaw: url?.searchParams.get("chat_id") ?? null,
    });
    return finishJson(request, res, { ok: false, error: "chat_id_required" }, 400);
  }

  const started = Date.now();
  const avatar = await gatewayFetchChatAvatar(userOrRes, chatId);
  if (avatar === "no_avatar") {
    logTelegramMessagesApi("messages_avatar_no_avatar", {
      telegramUsername: userOrRes,
      chatId,
      elapsedMs: Date.now() - started,
    });
    return finishJson(request, res, { ok: false, error: "no_avatar" }, 404);
  }
  if (!avatar) {
    logTelegramMessagesApi("messages_avatar_unavailable", {
      telegramUsername: userOrRes,
      chatId,
      elapsedMs: Date.now() - started,
    });
    return finishJson(request, res, { ok: false, error: "avatar_unavailable" }, 503);
  }
  logTelegramMessagesApi("messages_avatar_ok", {
    telegramUsername: userOrRes,
    chatId,
    mime: avatar.mime,
    bytes: avatar.data.byteLength,
    elapsedMs: Date.now() - started,
  });

  const headers = new Headers({
    "Content-Type": avatar.mime,
    "Cache-Control": "public, max-age=86400",
  });
  applyAuthApiCors(request, headers);
  const body = Buffer.from(avatar.data);

  if (res) {
    res.status(200);
    headers.forEach((v, k) => res.setHeader(k, v));
    res.end(body);
    return;
  }
  return new Response(new Uint8Array(avatar.data), { status: 200, headers });
}

export async function telegramMessagesWarmupHandler(
  request: AnyRequest,
  res?: NodeRes,
): Promise<Response | void> {
  const preflight = authApiPreflightResponse(request);
  if (preflight) return finishPreflight(request, res, preflight);
  if (requestMethod(request) !== "POST") {
    return finishJson(request, res, { ok: false, error: "method_not_allowed" }, 405);
  }

  const userOrRes = await requireUser(request);
  if (userOrRes instanceof Response) {
    if (res) {
      res.status(userOrRes.status);
      userOrRes.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await userOrRes.text());
      return;
    }
    return userOrRes;
  }

  const connected = await isTelegramMessagesConnected(userOrRes);
  if (!connected) {
    return finishJson(request, res, { ok: false, connected: false, error: "not_connected" }, 403);
  }

  const warm = await gatewayWarmupSession(userOrRes, { maxPollMs: 50_000 });
  if (warm.error === "no_session") {
    await revokeMtprotoSession(userOrRes);
    await disconnectTelegramMessages(userOrRes);
    return finishJson(request, res, {
      ok: false,
      connected: false,
      needsReconnect: true,
      gatewayReady: false,
      authState: warm.authState,
      error: warm.error,
    });
  }

  return finishJson(request, res, {
    ok: warm.ok,
    connected: true,
    gatewayReady: warm.ok,
    authState: warm.authState,
    error: warm.error ?? null,
  });
}

