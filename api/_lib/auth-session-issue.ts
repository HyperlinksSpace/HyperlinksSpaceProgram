import { createSession } from "../../database/telegramAuth.js";
import { randomUrlSafe, sha256Hex } from "./telegram-oidc.js";

export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "hs_auth_session";

/** `Set-Cookie` value for `hs_auth_session` (matches OAuth callback handlers). */
export function buildAuthSessionSetCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(AUTH_SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function issueAuthSession(input: {
  telegramUsername: string;
  secure: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ sessionToken: string; setCookie: string }> {
  const sessionToken = randomUrlSafe(32);
  const sessionHash = sha256Hex(sessionToken);
  const expiresAtIso = new Date(Date.now() + AUTH_SESSION_TTL_MS).toISOString();
  await createSession({
    sessionHash,
    telegramUsername: input.telegramUsername,
    expiresAtIso,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return {
    sessionToken,
    setCookie: buildAuthSessionSetCookie(sessionToken, input.secure),
  };
}
