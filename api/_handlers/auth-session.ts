import { getDefaultWalletByUsername } from "../../database/wallets.js";
import { deleteSession, getSessionByHash, touchSession } from "../../database/telegramAuth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";

type NodeRes = {
  status: (code: number) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};
type AnyRequest = Request | { method?: string; headers?: Record<string, string | string[] | undefined>; url?: string };

const SESSION_COOKIE = "hs_auth_session";
const JSON_HEADERS = { "Content-Type": "application/json" };

function getCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";").map((p) => p.trim());
  for (const p of pairs) {
    if (!p.startsWith(`${key}=`)) continue;
    const raw = p.slice(key.length + 1);
    return decodeURIComponent(raw);
  }
  return null;
}

function getHeader(request: AnyRequest, name: string): string | null {
  const lower = name.toLowerCase();
  const webHeaders = (request as Request).headers as Headers | undefined;
  if (webHeaders && typeof (webHeaders as Headers).get === "function") {
    return webHeaders.get(name);
  }
  const nodeHeaders = (request as { headers?: Record<string, string | string[] | undefined> }).headers;
  if (!nodeHeaders) return null;
  const raw = nodeHeaders[lower];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" ? raw : null;
}

function isSecureRequest(request: AnyRequest): boolean {
  const xfProto = getHeader(request, "x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0]?.trim() === "https";
  const rawUrl = (request as { url?: string }).url ?? "";
  return rawUrl.startsWith("https://");
}

function sendJson(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function sendJsonViaRes(res: NodeRes, body: object, status = 200): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

async function handler(request: AnyRequest, res?: NodeRes): Promise<Response | void> {
  const method = (request as { method?: string }).method ?? request.method;
  const token = getCookieValue(getHeader(request, "cookie"), SESSION_COOKIE);
  const secure = isSecureRequest(request);

  if (method === "DELETE") {
    if (token) {
      await deleteSession(sha256Hex(token));
    }
    const response = sendJson({ ok: true, cleared: true });
    response.headers.append("Set-Cookie", clearSessionCookie(secure));
    if (res) {
      res.status(response.status);
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
      return;
    }
    return response;
  }

  if (method !== "GET") {
    const body = { ok: false, error: "method_not_allowed" };
    if (res) return sendJsonViaRes(res, body, 405);
    return sendJson(body, 405);
  }

  if (!token) {
    const body = { ok: true, authenticated: false };
    if (res) return sendJsonViaRes(res, body, 200);
    return sendJson(body, 200);
  }

  const row = await getSessionByHash(sha256Hex(token));
  if (!row) {
    const body = { ok: true, authenticated: false };
    const response = sendJson(body, 200);
    response.headers.append("Set-Cookie", clearSessionCookie(secure));
    if (res) {
      res.status(response.status);
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
      return;
    }
    return response;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteSession(sha256Hex(token));
    const body = { ok: true, authenticated: false };
    const response = sendJson(body, 200);
    response.headers.append("Set-Cookie", clearSessionCookie(secure));
    if (res) {
      res.status(response.status);
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
      return;
    }
    return response;
  }

  await touchSession(sha256Hex(token));
  const wallet = await getDefaultWalletByUsername(row.telegram_username);
  const body = wallet
    ? {
        ok: true,
        authenticated: true,
        telegram_username: row.telegram_username,
        has_wallet: true,
        wallet: {
          id: wallet.id,
          wallet_address: wallet.wallet_address,
          wallet_blockchain: wallet.wallet_blockchain,
          wallet_net: wallet.wallet_net,
          type: wallet.type,
          label: wallet.label,
          is_default: wallet.is_default,
          source: wallet.source,
        },
      }
    : {
        ok: true,
        authenticated: true,
        telegram_username: row.telegram_username,
        has_wallet: false,
        wallet_required: true,
      };
  if (res) return sendJsonViaRes(res, body, 200);
  return sendJson(body, 200);
}

export default handler;
export const GET = handler;
export const DELETE = handler;

