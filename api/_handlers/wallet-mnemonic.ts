/**
 * POST /api/wallet-mnemonic
 * Reveal the signed-in user's built-in wallet recovery phrase (session-auth only).
 * Never log the mnemonic words.
 */
import {
  deleteSession,
  getSessionByHash,
  touchSession,
} from "../../database/telegramAuth.js";
import { getDefaultWalletByUsername } from "../../database/wallets.js";
import { upsertUserFromTma } from "../../database/users.js";
import { authByInitData } from "../wallet/_auth.js";
import { getSessionTokenFromRequest } from "../_lib/session-auth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";
import { unwrapMnemonicFromWalletRow } from "../_lib/unwrapWalletMnemonic.js";
import { parseRequestJsonBody } from "../_lib/parse-request-body.js";
import { appLog } from "../../shared/appLog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const LOG_TAG = "[api/wallet-mnemonic]";

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type PostBody = {
  initData?: unknown;
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

    const wallet = await getDefaultWalletByUsername(username);
    if (!wallet) {
      return sendJson(res, { ok: false, error: "no_wallet_row" }, 404);
    }

    try {
      const words = await unwrapMnemonicFromWalletRow(wallet);
      appLog(LOG_TAG, "ok", {
        usernamePrefix: `${username.slice(0, 3)}***`,
        wordCount: words.length,
        addressPreview: `${wallet.wallet_address.slice(0, 6)}…${wallet.wallet_address.slice(-4)}`,
      });
      return sendJson(
        res,
        {
          ok: true,
          mnemonic: words,
          wallet_address: wallet.wallet_address,
        },
        200,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "unwrap_failed";
      appLog(LOG_TAG, "unwrap_failed", {
        usernamePrefix: `${username.slice(0, 3)}***`,
        error: code,
      });
      return sendJson(res, { ok: false, error: code }, 500);
    }
  } catch (err) {
    appLog(LOG_TAG, "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return sendJson(res, { ok: false, error: "server_error" }, 500);
  }
}

export default handler;
