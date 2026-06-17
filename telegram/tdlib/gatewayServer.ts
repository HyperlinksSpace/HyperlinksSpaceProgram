import http from "http";
import { URL } from "url";
import { getGatewayBindHost, getGatewayPort, getGatewaySecret } from "./env.js";
import {
  disconnectUserSession,
  gatewayHealth,
  getChatAvatarImageForUser,
  getConnectAttempt,
  getLiveChatList,
  getLiveChatListRevision,
  resyncUserChats,
  restorePersistedGatewaySessions,
  resumeExistingSession,
  startConnectAttempt,
  submitConnectCode,
  submitConnectPassword,
  submitConnectPhoneNumber,
} from "./connectAttempts.js";

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: object): void {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(json);
}

function authorized(req: http.IncomingMessage): boolean {
  const secret = getGatewaySecret();
  const header = req.headers["x-gateway-secret"];
  return typeof header === "string" && header === secret;
}

export function startTdlibGatewayServer(): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (!req.url) {
          sendJson(res, 400, { ok: false, error: "bad_request" });
          return;
        }
        const url = new URL(req.url, "http://127.0.0.1");
        const pathname = url.pathname;

        if (req.method === "GET" && (pathname === "/" || pathname === "/v1/health")) {
          const body = { ...gatewayHealth(), hint: "TDLib gateway is running" };
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "health",
              method: req.method,
              pathname,
              remoteAddress: req.socket.remoteAddress ?? null,
            })}`,
          );
          sendJson(res, 200, body);
          return;
        }

        if (!authorized(req)) {
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "unauthorized",
              method: req.method,
              pathname,
            })}`,
          );
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }

        if (req.method === "POST" && pathname === "/v1/connect/start") {
          const body = (await readJson(req)) as {
            telegramUsername?: string;
            resume?: boolean;
            fresh?: boolean;
            resumeOnly?: boolean;
            authMethod?: "qr" | "phone";
          };
          const telegramUsername = (body.telegramUsername || "").trim();
          const authMethod = body.authMethod === "phone" ? "phone" : "qr";
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "connect_start",
              telegramUsername: telegramUsername || null,
              resume: Boolean(body.resume),
              fresh: Boolean(body.fresh),
              authMethod,
            })}`,
          );
          if (!telegramUsername) {
            sendJson(res, 400, { ok: false, error: "username_required" });
            return;
          }
          let snap = body.resume
            ? await resumeExistingSession(telegramUsername)
            : await startConnectAttempt(telegramUsername, {
                fresh: Boolean(body.fresh),
                authMethod,
              });
          if (body.resume && snap.authState === "failed" && snap.error === "no_session" && !body.resumeOnly) {
            console.log(
              `[tdlib-gateway] ${JSON.stringify({
                event: "connect_start_no_session_fallback",
                telegramUsername,
              })}`,
            );
            snap = await startConnectAttempt(telegramUsername, { authMethod });
          }
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "connect_start_result",
              telegramUsername,
              authState: snap.authState,
              error: snap.error,
              hasQrLink: Boolean(snap.qrLink),
            })}`,
          );
          sendJson(res, 200, { ok: snap.authState !== "failed" || Boolean(snap.attemptId), ...snap });
          return;
        }

        if (req.method === "POST" && pathname === "/v1/connect/resync") {
          const body = (await readJson(req)) as { telegramUsername?: string; chatIds?: number[] };
          const telegramUsername = (body.telegramUsername || "").trim();
          if (!telegramUsername) {
            sendJson(res, 400, { ok: false, error: "username_required" });
            return;
          }
          const chatIds = Array.isArray(body.chatIds)
            ? body.chatIds.filter((id) => typeof id === "number" && Number.isFinite(id))
            : undefined;
          const result = await resyncUserChats(
            telegramUsername,
            chatIds?.length ? { chatIds } : undefined,
          );
          sendJson(res, 200, {
            ok: !result.error,
            chatCount: result.chatCount,
            backfillCount: result.backfillCount,
            error: result.error,
          });
          return;
        }

        if (req.method === "GET" && pathname === "/v1/chats/list") {
          const telegramUsername = (url.searchParams.get("telegramUsername") || "").trim();
          if (!telegramUsername) {
            sendJson(res, 400, { ok: false, error: "username_required" });
            return;
          }
          const chats = getLiveChatList(telegramUsername);
          const revision = getLiveChatListRevision(telegramUsername);
          const missingPreviewCount = (chats ?? []).filter(
            (row) => typeof row.subtitle !== "string" || row.subtitle.trim().length === 0,
          ).length;
          const missingAvatarCount = (chats ?? []).filter((row) => !row.avatar_url).length;
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "chats_list_served",
              telegramUsername,
              count: chats?.length ?? 0,
              revision,
              missingPreviewCount,
              missingAvatarCount,
            })}`,
          );
          sendJson(res, 200, {
            ok: true,
            source: "live",
            revision,
            chats: chats ?? [],
          });
          return;
        }

        if (req.method === "GET" && pathname === "/v1/chat/avatar") {
          const telegramUsername = (url.searchParams.get("telegramUsername") || "").trim();
          const chatId = Number(url.searchParams.get("chatId"));
          if (!telegramUsername || !Number.isFinite(chatId)) {
            console.log(
              `[tdlib-gateway] ${JSON.stringify({
                event: "chat_avatar_invalid_params",
                telegramUsername: telegramUsername || null,
                chatId: Number.isFinite(chatId) ? chatId : null,
              })}`,
            );
            sendJson(res, 400, { ok: false, error: "invalid_params" });
            return;
          }
          const started = Date.now();
          const avatar = await getChatAvatarImageForUser(telegramUsername, chatId);
          if (avatar === "no_avatar") {
            console.log(
              `[tdlib-gateway] ${JSON.stringify({
                event: "chat_avatar_no_avatar",
                telegramUsername,
                chatId,
                elapsedMs: Date.now() - started,
              })}`,
            );
            sendJson(res, 404, { ok: false, error: "no_avatar" });
            return;
          }
          if (!avatar) {
            console.log(
              `[tdlib-gateway] ${JSON.stringify({
                event: "chat_avatar_unavailable",
                telegramUsername,
                chatId,
                elapsedMs: Date.now() - started,
              })}`,
            );
            sendJson(res, 503, { ok: false, error: "avatar_unavailable" });
            return;
          }
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "chat_avatar_ok",
              telegramUsername,
              chatId,
              bytes: avatar.data.length,
              mime: avatar.mime,
              elapsedMs: Date.now() - started,
            })}`,
          );
          res.statusCode = 200;
          res.setHeader("Content-Type", avatar.mime);
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.end(avatar.data);
          return;
        }

        if (req.method === "GET" && pathname === "/v1/connect/status") {
          const attemptId = (url.searchParams.get("attemptId") || "").trim();
          if (!attemptId) {
            sendJson(res, 400, { ok: false, error: "attempt_id_required" });
            return;
          }
          const snap = getConnectAttempt(attemptId);
          if (!snap) {
            sendJson(res, 404, { ok: false, error: "attempt_not_found" });
            return;
          }
          sendJson(res, 200, { ok: true, ...snap });
          return;
        }

        if (req.method === "POST" && pathname === "/v1/connect/phone") {
          const body = (await readJson(req)) as { attemptId?: string; phoneNumber?: string };
          const attemptId = (body.attemptId || "").trim();
          const phoneNumber = body.phoneNumber || "";
          if (!attemptId || !phoneNumber.trim()) {
            sendJson(res, 400, { ok: false, error: "attempt_id_and_phone_required" });
            return;
          }
          const snap = await submitConnectPhoneNumber(attemptId, phoneNumber);
          if (!snap) {
            sendJson(res, 404, { ok: false, error: "attempt_not_found" });
            return;
          }
          sendJson(res, 200, { ok: true, ...snap });
          return;
        }

        if (req.method === "POST" && pathname === "/v1/connect/code") {
          const body = (await readJson(req)) as { attemptId?: string; code?: string };
          const attemptId = (body.attemptId || "").trim();
          const code = body.code || "";
          if (!attemptId || !code.trim()) {
            sendJson(res, 400, { ok: false, error: "attempt_id_and_code_required" });
            return;
          }
          const snap = await submitConnectCode(attemptId, code);
          if (!snap) {
            sendJson(res, 404, { ok: false, error: "attempt_not_found" });
            return;
          }
          sendJson(res, 200, { ok: true, ...snap });
          return;
        }

        if (req.method === "POST" && pathname === "/v1/connect/password") {
          const body = (await readJson(req)) as { attemptId?: string; password?: string };
          const attemptId = (body.attemptId || "").trim();
          const password = body.password || "";
          if (!attemptId || !password) {
            sendJson(res, 400, { ok: false, error: "attempt_id_and_password_required" });
            return;
          }
          const snap = await submitConnectPassword(attemptId, password);
          if (!snap) {
            sendJson(res, 404, { ok: false, error: "attempt_not_found" });
            return;
          }
          sendJson(res, 200, { ok: true, ...snap });
          return;
        }

        if (req.method === "POST" && pathname === "/v1/disconnect") {
          const body = (await readJson(req)) as { telegramUsername?: string };
          const telegramUsername = (body.telegramUsername || "").trim();
          if (!telegramUsername) {
            sendJson(res, 400, { ok: false, error: "username_required" });
            return;
          }
          await disconnectUserSession(telegramUsername);
          sendJson(res, 200, { ok: true, disconnected: true });
          return;
        }

        sendJson(res, 404, { ok: false, error: "not_found" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "internal_error";
        sendJson(res, 500, { ok: false, error: message });
      }
    })();
  });

  const port = getGatewayPort();
  const host = getGatewayBindHost();
  server.listen(port, host, () => {
    console.log(`[tdlib-gateway] listening on http://${host}:${port}`);
    restorePersistedGatewaySessions();
  });

  return server;
}
