/**
 * POST /api/profile-display-name
 * Update the signed-in user's public display name (header label).
 */
import {
  deleteSession,
  getSessionByHash,
  touchSession,
} from "../../database/telegramAuth.js";
import { updateDisplayNameForUsername, upsertUserFromTma } from "../../database/users.js";
import { authByInitData } from "../wallet/_auth.js";
import { getSessionTokenFromRequest } from "../_lib/session-auth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";
import { parseRequestJsonBody } from "../_lib/parse-request-body.js";
import { appLog } from "../../shared/appLog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const LOG_TAG = "[api/profile-display-name]";

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type PostBody = {
  initData?: unknown;
  displayName?: unknown;
};

function sendJson(res: NodeRes | undefined, body: object, status: number): Response | void {
  const json = JSON.stringify(body);
  if (res) {
    res.setHeader("Content-Type", "application/json");
    res.status(status);
    res.end(json);
    return;
  }
  return new Response(json, { status, headers: JSON_HEADERS });
}

async function resolveUsername(
  request: Request,
  postBody?: { initData?: unknown },
): Promise<string | null> {
  const sessionToken = getSessionTokenFromRequest(request);
  if (sessionToken) {
    const hash = sha256Hex(sessionToken);
    const row = await getSessionByHash(hash);
    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      await deleteSession(hash);
      return null;
    }
    await touchSession(hash);
    return row.telegram_username;
  }

  const initData = typeof postBody?.initData === "string" ? postBody.initData.trim() : "";
  if (!initData) return null;
  const auth = authByInitData(initData);
  await upsertUserFromTma({
    telegramUsername: auth.telegramUsername,
    locale: auth.locale,
    displayName: auth.displayName,
    pictureUrl: auth.pictureUrl,
    authProvider: "telegram",
    loginSubject: auth.telegramUserId ?? auth.telegramUsername,
    telegramUsernameActual: auth.telegramUsername,
    providerUsername: auth.telegramUsername,
    telegramUserId: auth.telegramUserId,
  });
  return auth.telegramUsername;
}

async function handler(request: Request, res?: NodeRes): Promise<Response | void> {
  const method = (request as { method?: string }).method ?? "GET";
  if (method !== "POST") {
    return sendJson(res, { ok: false, error: "method_not_allowed" }, 405);
  }

  let postBody: PostBody = {};
  try {
    postBody = await parseRequestJsonBody<PostBody>(request);
  } catch {
    postBody = {};
  }

  try {
    const username = await resolveUsername(request, postBody);
    if (!username) {
      return sendJson(res, { ok: false, error: "unauthorized" }, 401);
    }

    const raw =
      typeof postBody.displayName === "string"
        ? postBody.displayName
        : typeof (postBody as { display_name?: unknown }).display_name === "string"
          ? (postBody as { display_name: string }).display_name
          : "";

    try {
      const displayName = await updateDisplayNameForUsername(username, raw);
      appLog(LOG_TAG, "ok", {
        usernamePrefix: `${username.slice(0, 3)}***`,
        nameLen: displayName.length,
      });
      return sendJson(res, { ok: true, display_name: displayName }, 200);
    } catch (err) {
      const code = err instanceof Error ? err.message : "update_failed";
      const status =
        code === "display_name_required" || code === "display_name_too_long"
          ? 400
          : code === "user_not_found"
            ? 404
            : 500;
      return sendJson(res, { ok: false, error: code }, status);
    }
  } catch (err) {
    appLog(LOG_TAG, "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return sendJson(res, { ok: false, error: "server_error" }, 500);
  }
}

export default handler;
