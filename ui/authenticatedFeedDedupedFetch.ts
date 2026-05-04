import { buildApiUrl } from "../api/_base";

/** Cold Vercel + Neon can exceed Telegram WebView stalls when multiple requests stack. */
export const AUTHENTICATED_FEED_FETCH_TIMEOUT_MS = 60_000;

export type AuthenticatedFeedDedupedResult = {
  httpStatus: number;
  httpOk: boolean;
  bodyText: string;
};

type Inflight = { dedupeKey: string; promise: Promise<AuthenticatedFeedDedupedResult> } | null;

let feedInflight: Inflight = null;

/**
 * At most **one** in-flight `/api/feed` per identical `POST`/`GET` fingerprint.
 *
 * Reads **`.text()` once** inside the singleton (no `response.clone()`), which some embedded
 * WebViews handle poorly when Strict Mode attaches two consumers.
 */
export function loadAuthenticatedFeedDeduped(
  initDataRaw: string | null | undefined,
): Promise<AuthenticatedFeedDedupedResult> {
  const url = buildApiUrl("/api/feed");
  const trimmed = typeof initDataRaw === "string" ? initDataRaw.trim() : "";
  const method = trimmed ? ("POST" as const) : ("GET" as const);
  const dedupeKey = trimmed.length > 0 ? `feed:POST:${trimmed}` : `feed:${method}`;

  const attach = feedInflight;
  if (attach && attach.dedupeKey === dedupeKey) {
    return attach.promise;
  }

  const promise = (async (): Promise<AuthenticatedFeedDedupedResult> => {
    const abort = new AbortController();
    const tid = setTimeout(() => abort.abort(), AUTHENTICATED_FEED_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        cache: "no-store",
        signal: abort.signal,
        headers: trimmed ? { "Content-Type": "application/json" } : undefined,
        body: trimmed ? JSON.stringify({ initData: trimmed }) : undefined,
      });
      const bodyText = await res.text();
      return { httpStatus: res.status, httpOk: res.ok, bodyText };
    } finally {
      clearTimeout(tid);
    }
  })();

  feedInflight = { dedupeKey, promise };

  void promise.finally(() => {
    if (feedInflight?.promise === promise) {
      feedInflight = null;
    }
  });

  return promise;
}
