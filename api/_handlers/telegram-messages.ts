import {
  disconnectTelegramMessages,
  getConnection,
  isTelegramMessagesConnected,
} from "../../database/telegramMessages.js";
import { revokeMtprotoSession } from "../../database/telegramMtproto.js";
import { applyAuthApiCors, authApiPreflightResponse } from "../_lib/auth-cors.js";
import { telegramUsernameFromSessionCookie } from "../_lib/session-auth.js";
import { appLog } from "../../shared/appLog.js";
import { gatewayDisconnect, gatewayFetchChatAvatar, gatewayFetchChatMessages, gatewayFetchLiveChats, gatewayFetchMessageMedia, gatewayFetchUserAvatar, gatewayFocusChat, gatewayResyncChats, gatewaySendChatMessage, gatewayWarmupSession } from "../_lib/tdlib-gateway-client.js";

type NodeRes = {
  status: (code: number) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string | Buffer) => void;
};

type AnyRequest = Request | { method?: string; headers?: Record<string, string | string[] | undefined>; url?: string };

const JSON_HEADERS = { "Content-Type": "application/json" };
const TELEGRAM_MESSAGES_API_LOG_PREFIX = "[telegram-messages-api]";

function logTelegramMessagesApi(event: string, details?: Record<string, unknown>): void {
  appLog(TELEGRAM_MESSAGES_API_LOG_PREFIX, event, details);
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

async function parseRequestBody<T extends Record<string, unknown> = Record<string, unknown>>(
  request: AnyRequest,
): Promise<T> {
  const raw = request as {
    body?: unknown;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
  if (raw.body !== undefined && raw.body !== null) {
    if (typeof raw.body === "object" && !Buffer.isBuffer(raw.body)) {
      return raw.body as T;
    }
    if (typeof raw.body === "string" && raw.body.trim()) {
      try {
        return JSON.parse(raw.body) as T;
      } catch {
        return {} as T;
      }
    }
  }
  const webReq = request as Request;
  if (typeof raw.json === "function") {
    try {
      const parsed = await raw.json();
      return (parsed && typeof parsed === "object" ? parsed : {}) as T;
    } catch {
      /* fall through */
    }
  }
  if (typeof webReq.text === "function") {
    try {
      const text = await webReq.text();
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
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
    peer_user_id: row.peer_user_id ?? null,
    presence_kind: row.presence_kind ?? null,
    presence_at: row.presence_at ?? null,
    chat_action: row.chat_action ?? null,
    chat_action_user_id: row.chat_action_user_id ?? null,
    chat_action_user_name: row.chat_action_user_name ?? null,
    chat_action_expires_at: row.chat_action_expires_at ?? null,
    is_pinned: Boolean(row.is_pinned),
    pin_order: typeof row.pin_order === "string" ? row.pin_order : "0",
    last_read_outbox_message_id:
      typeof row.last_read_outbox_message_id === "number" &&
      Number.isFinite(row.last_read_outbox_message_id) &&
      row.last_read_outbox_message_id > 0
        ? row.last_read_outbox_message_id
        : null,
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

function requestUrl(request: AnyRequest): URL {
  const raw = (request as { url?: string }).url ?? (request as Request).url ?? "";
  try {
    return new URL(raw);
  } catch {
    return new URL(raw, "http://localhost");
  }
}

function parseOptionalIdParam(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (raw == null || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
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
  const chatId = parseOptionalIdParam(url, "chat_id");
  const userId = parseOptionalIdParam(url, "user_id");
  const hasUserId = userId != null;
  if (chatId == null && !hasUserId) {
    logTelegramMessagesApi("messages_avatar_bad_request", {
      telegramUsername: userOrRes,
      chatIdRaw: url.searchParams.get("chat_id"),
      userIdRaw: url.searchParams.get("user_id"),
    });
    return finishJson(request, res, { ok: false, error: "chat_id_or_user_id_required" }, 400);
  }

  const started = Date.now();
  const avatar = hasUserId
    ? await gatewayFetchUserAvatar(userOrRes, userId)
    : await gatewayFetchChatAvatar(userOrRes, chatId!);
  if (avatar === "no_avatar") {
    logTelegramMessagesApi("messages_avatar_no_avatar", {
      telegramUsername: userOrRes,
      chatId: hasUserId ? null : chatId,
      userId: hasUserId ? userId : null,
      elapsedMs: Date.now() - started,
    });
    return finishJson(request, res, { ok: false, error: "no_avatar" }, 404);
  }
  if (!avatar) {
    logTelegramMessagesApi("messages_avatar_unavailable", {
      telegramUsername: userOrRes,
      chatId: hasUserId ? null : chatId,
      userId: hasUserId ? userId : null,
      elapsedMs: Date.now() - started,
    });
    return finishJson(request, res, { ok: false, error: "avatar_unavailable" }, 503);
  }
  logTelegramMessagesApi("messages_avatar_ok", {
    telegramUsername: userOrRes,
    chatId: hasUserId ? null : chatId,
    userId: hasUserId ? userId : null,
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

export async function telegramMessagesHistoryHandler(
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
    return finishJson(request, res, { ok: false, error: "not_connected", connected: false }, 403);
  }

  const url = requestUrl(request);
  const chatId = parseOptionalIdParam(url, "chat_id");
  const limitRaw = url.searchParams.get("limit");
  const parsedLimit = limitRaw == null || limitRaw.trim() === "" ? 50 : Number(limitRaw);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
  const beforeMessageId = parseOptionalIdParam(url, "before_message_id");
  if (chatId == null) {
    logTelegramMessagesApi("messages_history_bad_request", {
      telegramUsername: userOrRes,
      chatIdRaw: url.searchParams.get("chat_id"),
      requestUrl: url.pathname + url.search,
    });
    return finishJson(request, res, { ok: false, error: "chat_id_required" }, 400);
  }

  const started = Date.now();
  const result = await gatewayFetchChatMessages(userOrRes, chatId, limit, beforeMessageId);
  logTelegramMessagesApi("messages_history_served", {
    telegramUsername: userOrRes,
    chatId,
    beforeMessageId,
    count: result.messages.length,
    hasMoreOlder: result.hasMoreOlder,
    nextBeforeMessageId: result.nextBeforeMessageId,
    error: result.error,
    elapsedMs: Date.now() - started,
  });

  if (result.error) {
    return finishJson(
      request,
      res,
      {
        ok: false,
        error: result.error,
        messages: [],
        has_more_older: false,
        next_before_message_id: null,
      },
      result.error === "session_not_ready" ? 503 : 502,
    );
  }

  return finishJson(
    request,
    res,
    {
      ok: true,
      chat_kind: result.chatKind,
      messages: result.messages,
      has_more_older: result.hasMoreOlder,
      next_before_message_id: result.nextBeforeMessageId,
      last_read_outbox_message_id: result.lastReadOutboxMessageId,
    },
    200,
  );
}

export async function telegramMessagesMediaHandler(
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
    return finishJson(request, res, { ok: false, error: "not_connected" }, 403);
  }

  const url = requestUrl(request);
  const chatId = parseOptionalIdParam(url, "chat_id");
  const messageId = parseOptionalIdParam(url, "message_id");
  if (chatId == null || messageId == null) {
    return finishJson(request, res, { ok: false, error: "chat_id_and_message_id_required" }, 400);
  }

  const previewParam = (url.searchParams.get("preview") || "").trim();
  const preview = previewParam === "1" || previewParam === "true";

  const media = await gatewayFetchMessageMedia(userOrRes, chatId, messageId, preview);
  if (!media) {
    return finishJson(request, res, { ok: false, error: "media_unavailable" }, 404);
  }

  const headers = new Headers({
    "Content-Type": media.mime,
    "Cache-Control": "public, max-age=86400",
  });
  applyAuthApiCors(request, headers);
  const body = Buffer.from(media.data);

  if (res) {
    res.status(200);
    headers.forEach((v, k) => res.setHeader(k, v));
    res.end(body);
    return;
  }
  return new Response(new Uint8Array(media.data), { status: 200, headers });
}

export async function telegramMessagesSendHandler(
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

  const body = await parseRequestBody<{ chat_id?: unknown; text?: unknown }>(request);

  const chatId = Number(body.chat_id);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!Number.isFinite(chatId) || chatId === 0) {
    logTelegramMessagesApi("messages_send_bad_request", {
      telegramUsername: userOrRes,
      chatIdRaw: body.chat_id,
      textLength: typeof body.text === "string" ? body.text.length : null,
      error: "chat_id_required",
    });
    return finishJson(request, res, { ok: false, error: "chat_id_required" }, 400);
  }
  if (!text) {
    return finishJson(request, res, { ok: false, error: "text_required" }, 400);
  }
  if (text.length > 4096) {
    return finishJson(request, res, { ok: false, error: "text_too_long" }, 400);
  }

  const started = Date.now();
  const result = await gatewaySendChatMessage(userOrRes, chatId, text);
  logTelegramMessagesApi("messages_send", {
    telegramUsername: userOrRes,
    chatId,
    ok: !result.error,
    messageId:
      result.message && typeof result.message.telegram_message_id === "number"
        ? result.message.telegram_message_id
        : null,
    error: result.error,
    elapsedMs: Date.now() - started,
  });

  if (result.error) {
    return finishJson(
      request,
      res,
      { ok: false, error: result.error, message: null },
      result.error === "session_not_ready" ? 503 : 502,
    );
  }

  return finishJson(request, res, { ok: true, message: result.message }, 200);
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

  const body = await parseRequestBody<{ chat_id?: number }>(request);
  const focusChatId = Number(body.chat_id);

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

  let focusOk: boolean | null = null;
  if (warm.ok && Number.isFinite(focusChatId) && focusChatId !== 0) {
    const focus = await gatewayFocusChat(userOrRes, focusChatId);
    focusOk = focus.ok;
  }

  return finishJson(request, res, {
    ok: warm.ok,
    connected: true,
    gatewayReady: warm.ok,
    authState: warm.authState,
    focusOk,
    error: warm.error ?? null,
  });
}

