import {
  disconnectTelegramMessages,
  getConnection,
  isTelegramMessagesConnected,
  listTelegramThreads,
} from "../../database/telegramMessages.js";
import { revokeMtprotoSession } from "../../database/telegramMtproto.js";
import { applyAuthApiCors, authApiPreflightResponse } from "../_lib/auth-cors.js";
import { telegramUsernameFromSessionCookie } from "../_lib/session-auth.js";
import { gatewayDisconnect, gatewayResyncChats } from "../_lib/tdlib-gateway-client.js";

type NodeRes = {
  status: (code: number) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type AnyRequest = Request | { method?: string; headers?: Record<string, string | string[] | undefined>; url?: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

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
    return finishJson(request, res, { ok: false, error: "not_connected", connected: false }, 403);
  }

  const chats = await listTelegramThreads(userOrRes);
  return finishJson(request, res, { ok: true, connected: true, chats }, 200);
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

  const result = await gatewayResyncChats(userOrRes);
  const staleSession =
    result.error === "no_session" || result.error === "session_not_ready";
  if (staleSession) {
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
