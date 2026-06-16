import http from "http";
import { URL } from "url";
import { getGatewayBindHost, getGatewayPort, getGatewaySecret } from "./env.js";
import {
  disconnectUserSession,
  gatewayHealth,
  getConnectAttempt,
  resyncUserChats,
  restorePersistedGatewaySessions,
  resumeExistingSession,
  startConnectAttempt,
  submitConnectPassword,
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
          const body = { ok: true, ...gatewayHealth(), hint: "TDLib gateway is running" };
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
          };
          const telegramUsername = (body.telegramUsername || "").trim();
          console.log(
            `[tdlib-gateway] ${JSON.stringify({
              event: "connect_start",
              telegramUsername: telegramUsername || null,
              resume: Boolean(body.resume),
              fresh: Boolean(body.fresh),
            })}`,
          );
          if (!telegramUsername) {
            sendJson(res, 400, { ok: false, error: "username_required" });
            return;
          }
          let snap = body.resume
            ? await resumeExistingSession(telegramUsername)
            : await startConnectAttempt(telegramUsername, { fresh: Boolean(body.fresh) });
          if (body.resume && snap.authState === "failed" && snap.error === "no_session") {
            console.log(
              `[tdlib-gateway] ${JSON.stringify({
                event: "connect_start_no_session_fallback",
                telegramUsername,
              })}`,
            );
            snap = await startConnectAttempt(telegramUsername);
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
          const body = (await readJson(req)) as { telegramUsername?: string };
          const telegramUsername = (body.telegramUsername || "").trim();
          if (!telegramUsername) {
            sendJson(res, 400, { ok: false, error: "username_required" });
            return;
          }
          const result = await resyncUserChats(telegramUsername);
          sendJson(res, 200, {
            ok: !result.error,
            chatCount: result.chatCount,
            error: result.error,
          });
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
