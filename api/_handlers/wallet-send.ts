/**
 * POST /api/wallet-send
 * Transfer native TON or a jetton from the built-in wallet via @ton/ton (server-side
 * mnemonic unwrap + WalletContractV4.sendTransfer).
 */
import {
  deleteSession,
  getSessionByHash,
  touchSession,
} from "../../database/telegramAuth.js";
import { getDefaultWalletByUsername } from "../../database/wallets.js";
import { upsertUserFromTma } from "../../database/users.js";
import { sendBuiltInTransfer } from "../../services/wallet/sendBuiltInTransfer.js";
import { authByInitData } from "../wallet/_auth.js";
import { getSessionTokenFromRequest } from "../_lib/session-auth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";
import { unwrapMnemonicFromWalletRow } from "../_lib/unwrapWalletMnemonic.js";
import { appLog } from "../../shared/appLog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const LOG_TAG = "[api/wallet-send]";

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type PostBody = {
  initData?: unknown;
  toAddress?: unknown;
  amount?: unknown;
  decimals?: unknown;
  jettonMasterAddress?: unknown;
  comment?: unknown;
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
    postBody = (await request.json()) as PostBody;
  } catch {
    postBody = {};
  }

  try {
    const username = await resolveUsername(request, postBody);
    if (!username) {
      return sendJson(res, { ok: false, error: "unauthorized" }, 401);
    }

    const toAddress = typeof postBody.toAddress === "string" ? postBody.toAddress.trim() : "";
    const amount = typeof postBody.amount === "string" ? postBody.amount.trim() : "";
    const decimalsRaw = postBody.decimals;
    const decimals =
      typeof decimalsRaw === "number"
        ? decimalsRaw
        : typeof decimalsRaw === "string"
          ? Number(decimalsRaw)
          : NaN;
    const jettonMasterAddress =
      typeof postBody.jettonMasterAddress === "string"
        ? postBody.jettonMasterAddress.trim()
        : "";
    const comment = typeof postBody.comment === "string" ? postBody.comment : "";

    if (!toAddress) {
      return sendJson(res, { ok: false, error: "missing_to_address" }, 400);
    }
    if (!amount) {
      return sendJson(res, { ok: false, error: "missing_amount" }, 400);
    }
    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
      return sendJson(res, { ok: false, error: "invalid_decimals" }, 400);
    }

    const wallet = await getDefaultWalletByUsername(username);
    if (!wallet) {
      return sendJson(res, { ok: false, error: "no_wallet_row" }, 404);
    }

    const mnemonic = await unwrapMnemonicFromWalletRow(wallet);
    const result = await sendBuiltInTransfer({
      mnemonic,
      toAddress,
      amount,
      decimals,
      jettonMasterAddress: jettonMasterAddress || null,
      comment,
      expectedFromAddress: wallet.wallet_address,
    });

    appLog(LOG_TAG, result.ok ? "send_ok" : "send_failed", {
      usernamePrefix: `${username.slice(0, 3)}***`,
      walletId: wallet.id,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      hasJetton: Boolean(jettonMasterAddress),
    });

    if (!result.ok) {
      const status =
        result.error === "address_mismatch"
          ? 422
          : result.error === "invalid_to_address" || result.error === "invalid_amount"
            ? 400
            : 400;
      return sendJson(res, result, status);
    }

    return sendJson(res, result, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    appLog(LOG_TAG, "handler_error", { error: msg });
    const status =
      msg === "bot_token_not_configured"
        ? 500
        : msg === "invalid_initdata" || msg === "username_required"
          ? 401
          : msg === "wallet_row_missing_envelope"
            ? 422
            : 500;
    return sendJson(res, { ok: false, error: msg }, status);
  }
}

export default handler;
export const GET = handler;
export const POST = handler;
