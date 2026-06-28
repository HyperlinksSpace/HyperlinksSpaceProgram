import { deleteSession, getSessionByHash, touchSession } from "../../database/telegramAuth.js";
import { sha256Hex } from "./telegram-oidc.js";

const SESSION_COOKIE = "hs_auth_session";

type AnyRequest = Request | { method?: string; headers?: Record<string, string | string[] | undefined>; url?: string };

function getHeader(request: AnyRequest, name: string): string | null {
  const lower = name.toLowerCase();
  const webHeaders = (request as Request).headers as Headers | undefined;
  if (webHeaders && typeof webHeaders.get === "function") {
    return webHeaders.get(name);
  }
  const nodeHeaders = (request as { headers?: Record<string, string | string[] | undefined> }).headers;
  if (!nodeHeaders) return null;
  const raw = nodeHeaders[lower];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" ? raw : null;
}

function getCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  for (const p of cookieHeader.split(";")) {
    const t = p.trim();
    if (t.startsWith(`${key}=`)) return decodeURIComponent(t.slice(key.length + 1));
  }
  return null;
}

/** Cookie (`hs_auth_session`) or `Authorization: Bearer` (Electron desktop shell). */
export function getSessionTokenFromRequest(request: AnyRequest): string | null {
  const fromCookie = getCookieValue(getHeader(request, "cookie"), SESSION_COOKIE);
  if (fromCookie) return fromCookie;
  const auth = getHeader(request, "authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    return token || null;
  }
  return null;
}

/**
 * Resolve authenticated `telegram_username` from session cookie or bearer token.
 * Returns null when missing, invalid, or expired.
 */
export async function telegramUsernameFromSessionCookie(
  request: AnyRequest,
): Promise<string | null> {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;

  const hash = sha256Hex(token);
  const row = await getSessionByHash(hash);
  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteSession(hash);
    return null;
  }

  await touchSession(hash);
  return row.telegram_username;
}
