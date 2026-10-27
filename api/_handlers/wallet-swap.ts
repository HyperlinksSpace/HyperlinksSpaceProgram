/**
 * POST /api/wallet-swap
 * Built-in wallet: unwrap GCP/KMS mnemonic, build Swap.Coffee txs, sign, broadcast.
 */
import {
  deleteSession,
  getSessionByHash,
  touchSession,
} from "../../database/telegramAuth.js";
import { getDefaultWalletByUsername } from "../../database/wallets.js";
import { upsertUserFromTma } from "../../database/users.js";
import { executeSwap } from "../../services/swap/executeSwap.js";
import { authByInitData } from "../wallet/_auth.js";
import { getSessionTokenFromRequest } from "../_lib/session-auth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";
import { unwrapMnemonicFromWalletRow } from "../_lib/unwrapWalletMnemonic.js";
import { parseRequestJsonBody } from "../_lib/parse-request-body.js";
import { appLog } from "../../shared/appLog.js";
type SwapPairToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
};

function isDllrToken(token: SwapPairToken): boolean {
  const address = token.address.trim().toLowerCase();
  if (address === "jetton:dllr") return true;
  return token.symbol.trim().toUpperCase() === "DLLR";
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const LOG_TAG = "[api/wallet-swap]";

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type PostBody = {
  initData?: unknown;
  fromToken?: unknown;
  toToken?: unknown;
  fromAmount?: unknown;
  slippage?: unknown;
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

function parseToken(raw: unknown): SwapPairToken | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const address = typeof t.address === "string" ? t.address.trim() : "";
  const symbol = typeof t.symbol === "string" ? t.symbol.trim() : "";
  const name = typeof t.name === "string" ? t.name.trim() : symbol;
  const decimals = typeof t.decimals === "number" ? t.decimals : Number(t.decimals);
  if (!address || !symbol || !Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
    return null;
  }
  return {
    address,
    symbol,
    name: name || symbol,
    decimals,
    isNative: t.isNative === true,
  };
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

function tonRpc(): { url: string; key?: string } {
  const url =
    process.env.TONCENTER_RPC_URL?.trim() ||
    process.env.TON_RPC_URL?.trim() ||
    "https://toncenter.com/api/v2/jsonRPC";
  const key =
    process.env.TONCENTER_API_KEY?.trim() ||
    process.env.TONCENTER_MAINNET_API_KEY?.trim() ||
    undefined;
  return { url, key };
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

    const fromToken = parseToken(postBody.fromToken);
    const toToken = parseToken(postBody.toToken);
    const fromAmount =
      typeof postBody.fromAmount === "string"
        ? postBody.fromAmount.trim()
        : typeof postBody.fromAmount === "number" && Number.isFinite(postBody.fromAmount)
          ? String(postBody.fromAmount)
          : "";
    const slippageRaw = postBody.slippage;
    const slippage =
      typeof slippageRaw === "number"
        ? slippageRaw
        : typeof slippageRaw === "string"
          ? Number(slippageRaw)
          : 0.1;

    if (!fromToken || !toToken) {
      return sendJson(res, { ok: false, error: "token_required" }, 400);
    }
    if (!fromAmount) {
      return sendJson(res, { ok: false, error: "invalid_amount" }, 400);
    }
    if (isDllrToken(fromToken) || isDllrToken(toToken)) {
      return sendJson(res, { ok: false, error: "dllr_frozen" }, 400);
    }

    const wallet = await getDefaultWalletByUsername(username);
    if (!wallet) {
      return sendJson(res, { ok: false, error: "no_wallet_row" }, 404);
    }

    const mnemonic = await unwrapMnemonicFromWalletRow(wallet);
    const rpc = tonRpc();
    const result = await executeSwap({
      fromToken,
      toToken,
      fromAmount,
      slippage: Number.isFinite(slippage) && slippage > 0 ? slippage : 0.1,
      senderAddress: wallet.wallet_address,
      mnemonic,
      tonRpcUrl: rpc.url,
      tonRpcKey: rpc.key,
    });

    appLog(LOG_TAG, result.success ? "swap_ok" : "swap_failed", {
      usernamePrefix: `${username.slice(0, 3)}***`,
      from: fromToken.symbol,
      to: toToken.symbol,
      error: result.error,
      routeId: result.routeId,
    });

    if (!result.success) {
      return sendJson(res, { ok: false, error: result.error ?? "swap_failed" }, 400);
    }
    return sendJson(
      res,
      { ok: true, routeId: result.routeId, routeStatus: result.routeStatus },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "swap_failed";
    appLog(LOG_TAG, "swap_exception", { error: message });
    return sendJson(res, { ok: false, error: message }, 500);
  }
}

export default handler;
