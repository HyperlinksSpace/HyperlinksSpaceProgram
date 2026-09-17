/**
 * POST /api/wallet-send
 * - DLLR: ledger transfer between built-in wallets (DB debit/credit).
 * - Native TON / jetton: @ton/ton WalletContractV4.sendTransfer from built-in mnemonic.
 */
import {
  deleteSession,
  getSessionByHash,
  touchSession,
} from "../../database/telegramAuth.js";
import {
  findUsernameByBuiltinWalletAddress,
  getDllrLedgerForUsername,
  tonAddressesEqual,
  transferDllrBetweenUsernames,
} from "../../database/dllrBalances.js";
import { getDefaultWalletByUsername } from "../../database/wallets.js";
import { upsertUserFromTma } from "../../database/users.js";
import { sendBuiltInTransfer } from "../../services/wallet/sendBuiltInTransfer.js";
import { authByInitData } from "../wallet/_auth.js";
import { getSessionTokenFromRequest } from "../_lib/session-auth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";
import { unwrapMnemonicFromWalletRow } from "../_lib/unwrapWalletMnemonic.js";
import { parseRequestJsonBody } from "../_lib/parse-request-body.js";
import { appLog } from "../../shared/appLog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const LOG_TAG = "[api/wallet-send]";
const DLLR_ASSET = "dllr";
const DLLR_ROW_KEY = "jetton:dllr";

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
  asset?: unknown;
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

function isDllrAsset(postBody: PostBody): boolean {
  const asset = typeof postBody.asset === "string" ? postBody.asset.trim().toLowerCase() : "";
  if (asset === DLLR_ASSET || asset === DLLR_ROW_KEY) return true;
  const jetton =
    typeof postBody.jettonMasterAddress === "string"
      ? postBody.jettonMasterAddress.trim().toLowerCase()
      : "";
  return jetton === DLLR_ROW_KEY || jetton === DLLR_ASSET;
}

function parseDllrAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1e6) / 1e6;
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
    // Vercel Node often pre-parses into req.body; request.json() then yields {}.
    postBody = await parseRequestJsonBody<PostBody>(request);
  } catch {
    postBody = {};
  }

  try {
    const username = await resolveUsername(request, postBody);
    if (!username) {
      return sendJson(res, { ok: false, error: "unauthorized" }, 401);
    }

    const toAddressRaw =
      typeof postBody.toAddress === "string"
        ? postBody.toAddress
        : typeof (postBody as { to_address?: unknown }).to_address === "string"
          ? (postBody as { to_address: string }).to_address
          : "";
    const toAddress = toAddressRaw.trim();
    const amountRaw = postBody.amount;
    const amount =
      typeof amountRaw === "string"
        ? amountRaw.trim()
        : typeof amountRaw === "number" && Number.isFinite(amountRaw)
          ? String(amountRaw)
          : "";
    const comment = typeof postBody.comment === "string" ? postBody.comment : "";

    if (!toAddress) {
      appLog(LOG_TAG, "missing_to_address", {
        bodyKeys: Object.keys(postBody as object),
        hasAsset: typeof postBody.asset === "string",
      });
      return sendJson(res, { ok: false, error: "missing_to_address" }, 400);
    }
    if (!amount) {
      return sendJson(res, { ok: false, error: "missing_amount" }, 400);
    }

    const wallet = await getDefaultWalletByUsername(username);
    if (!wallet) {
      return sendJson(res, { ok: false, error: "no_wallet_row" }, 404);
    }

    if (isDllrAsset(postBody)) {
      const amountUsd = parseDllrAmount(amount);
      if (amountUsd == null) {
        return sendJson(res, { ok: false, error: "invalid_amount" }, 400);
      }

      if (tonAddressesEqual(wallet.wallet_address, toAddress)) {
        return sendJson(res, { ok: false, error: "cannot_send_to_self" }, 400);
      }

      const toUsername = await findUsernameByBuiltinWalletAddress(toAddress);
      if (!toUsername) {
        return sendJson(res, { ok: false, error: "recipient_not_builtin_wallet" }, 404);
      }

      const transfer = await transferDllrBetweenUsernames({
        fromUsername: username,
        toUsername,
        amountUsd,
      });

      appLog(LOG_TAG, transfer.ok ? "dllr_send_ok" : "dllr_send_failed", {
        usernamePrefix: `${username.slice(0, 3)}***`,
        toPrefix: `${toUsername.slice(0, 3)}***`,
        ok: transfer.ok,
        error: transfer.ok ? undefined : transfer.error,
        amountUsd,
        commentLen: comment.trim().length,
      });

      if (!transfer.ok) {
        const status =
          transfer.error === "insufficient_dllr"
            ? 409
            : transfer.error === "cannot_send_to_self"
              ? 400
              : 400;
        // Include current ledger so the client can drop a stale local balance display.
        const fromLedger = await getDllrLedgerForUsername(username);
        const hot = fromLedger?.hotUsd ?? 0;
        const frozen = fromLedger?.frozenUsd ?? 0;
        return sendJson(
          res,
          {
            ...transfer,
            dllr_hot_usd: hot,
            dllr_frozen_usd: frozen,
            dllr_balance_usd: Math.round((hot + frozen) * 1e6) / 1e6,
          },
          status,
        );
      }

      const fromBalance =
        Math.round((transfer.from.hotUsd + transfer.from.frozenUsd) * 1e6) / 1e6;
      const recipientBalance =
        Math.round((transfer.to.hotUsd + transfer.to.frozenUsd) * 1e6) / 1e6;

      return sendJson(
        res,
        {
          ok: true,
          asset: DLLR_ASSET,
          amountUsd: transfer.amountUsd,
          fromAddress: wallet.wallet_address,
          toAddress,
          toUsername,
          comment: comment.trim() || undefined,
          dllr_hot_usd: transfer.from.hotUsd,
          dllr_frozen_usd: transfer.from.frozenUsd,
          dllr_balance_usd: fromBalance,
          recipient_dllr_hot_usd: transfer.to.hotUsd,
          recipient_dllr_frozen_usd: transfer.to.frozenUsd,
          recipient_dllr_balance_usd: recipientBalance,
        },
        200,
      );
    }

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

    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
      return sendJson(res, { ok: false, error: "invalid_decimals" }, 400);
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
