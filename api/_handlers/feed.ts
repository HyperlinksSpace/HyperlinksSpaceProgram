/**
 * Authenticated feed: lists `feed_items` and triggers welcome bundle delivery once per user.
 */
import {
  deleteSession,
  getSessionByHash,
  touchSession,
} from "../../database/telegramAuth.js";
import {
  bootstrapAuthenticatedFeedItems,
  type FeedCatalogLocale,
} from "../../database/feed.js";
import {
  FEED_CATALOG_FALLBACK_LOCALE,
  parseFeedCatalogLocaleHint,
} from "../../locales/resolveFeedCatalogLocale.js";
import { upsertUserFromTma } from "../../database/users.js";
import { authByInitData } from "../wallet/_auth.js";
import { sha256Hex } from "../_lib/telegram-oidc.js";

const SESSION_COOKIE = "hs_auth_session";
const JSON_HEADERS = { "Content-Type": "application/json" };

function feedLog(payload: Record<string, unknown>): void {
  console.log(
    `[api/feed] ${JSON.stringify({ t: new Date().toISOString(), ...payload })}`,
  );
}

function getHeader(req: Request, name: string): string | null {
  const h = req.headers;
  if (h && typeof h.get === "function") return h.get(name);
  return null;
}

function getCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  for (const p of cookieHeader.split(";")) {
    const t = p.trim();
    if (t.startsWith(`${key}=`)) return decodeURIComponent(t.slice(key.length + 1));
  }
  return null;
}

async function telegramUsernameFromRequest(
  request: Request,
  postBody?: { initData?: unknown },
): Promise<{
  username: string;
  locale: string | null;
} | null> {
  const method = request.method ?? "GET";
  const cookie = getCookieValue(getHeader(request, "cookie"), SESSION_COOKIE);
  if (cookie) {
    const hash = sha256Hex(cookie);
    const row = await getSessionByHash(hash);
    if (!row) {
      return null;
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      await deleteSession(hash);
      return null;
    }
    await touchSession(hash);
    return { username: row.telegram_username, locale: null };
  }

  if (method !== "POST") return null;
  let body = postBody;
  if (!body) {
    try {
      body = (await request.json()) as { initData?: unknown };
    } catch {
      return null;
    }
  }
  const initData = typeof body?.initData === "string" ? body.initData : "";
  if (!initData) return null;
  const auth = authByInitData(initData);
  await upsertUserFromTma({ telegramUsername: auth.telegramUsername, locale: auth.locale });
  return { username: auth.telegramUsername, locale: auth.locale };
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function catalogLocaleFromRequest(request: Request, bodyCatalogLocale?: unknown): FeedCatalogLocale {
  const hinted = parseFeedCatalogLocaleHint(bodyCatalogLocale);
  if (hinted) return hinted;
  try {
    const url = new URL(request.url);
    const fromQuery = parseFeedCatalogLocaleHint(url.searchParams.get("catalog_locale"));
    if (fromQuery) return fromQuery;
  } catch {
    /* ignore */
  }
  return FEED_CATALOG_FALLBACK_LOCALE;
}

async function handler(request: Request): Promise<Response> {
  const t0 = Date.now();
  const method = request.method ?? "GET";
  let postBody: { initData?: unknown; catalog_locale?: unknown } = {};
  if (method === "POST") {
    try {
      postBody = (await request.json()) as {
        initData?: unknown;
        catalog_locale?: unknown;
      };
    } catch {
      postBody = {};
    }
  }
  const displayLocale = catalogLocaleFromRequest(request, postBody.catalog_locale);

  feedLog({
    phase: "request_start",
    method,
    cookiePresent: (() => {
      const c = getCookieValue(getHeader(request, "cookie"), SESSION_COOKIE);
      return typeof c === "string" && c.length > 0;
    })(),
    urlSnippet: typeof request.url === "string" ? request.url.slice(0, 120) : null,
  });

  if (method !== "GET" && method !== "POST") {
    feedLog({ phase: "method_reject", durationMs: Date.now() - t0, method });
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const authStart = Date.now();
    const user = await telegramUsernameFromRequest(request, postBody);
    feedLog({
      phase: "auth_resolve",
      durationMs: Date.now() - t0,
      authInnerMs: Date.now() - authStart,
      ok: !!user,
      usernameLen: user?.username?.length ?? 0,
      hasLocaleHint: !!user?.locale,
    });

    if (!user) {
      feedLog({
        phase: "unauthorized",
        durationMs: Date.now() - t0,
        method,
        hint_post_initdata_when_no_cookie:
          method === "GET",
      });
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const listStart = Date.now();
    const deliverLocalePreferred =
      user.locale ??
      (displayLocale !== FEED_CATALOG_FALLBACK_LOCALE ? displayLocale : null);
    const items = await bootstrapAuthenticatedFeedItems({
      telegramUsername: user.username,
      catalogLocale: displayLocale,
      localePreferred: deliverLocalePreferred,
    });
    feedLog({
      phase: "response_ok",
      itemCount: items.length,
      displayLocale,
      listMs: Date.now() - listStart,
      totalMs: Date.now() - t0,
      usernamePrefix:
        user.username.length > 0
          ? `${user.username.slice(0, Math.min(3, user.username.length))}***`
          : "empty",
    });
    return jsonResponse({ ok: true, items }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    const status =
      msg === "bot_token_not_configured"
        ? 500
        : msg === "invalid_initdata" || msg === "username_required"
          ? 401
          : 400;
    feedLog({
      phase: "handler_error",
      durationMs: Date.now() - t0,
      httpStatus: status,
      error: msg,
    });
    return jsonResponse({ ok: false, error: msg }, status);
  }
}

export default handler;
export const GET = handler;
export const POST = handler;
