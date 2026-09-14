import { isDesktopAppShell } from "../appShell";
import { logPageDisplay } from "../pageDisplayLog";
import { mapSwapCoffeeHybridSearchPage } from "./mapSwapCoffeeHybridSearch";
import { SWAP_COFFEE_TOKENS_API_BASE } from "./swapChartConstants";
import { swapCoffeeFetch } from "./swapCoffeeFetch";
import type { SwapAccountJettonsResponse, SwapJetton } from "./swapJettonsTypes";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

type CatalogQuery = {
  sort: string;
  verifications: readonly string[];
};

/**
 * Prefer TVL pages so the first screen is liquid tokens the UI can re-rank by
 * market cap. Swap.Coffee intermittently 400s TVL/MCAP when UNKNOWN is included
 * ("Character I…" Inf parse) — fall back without UNKNOWN, then PRICE_CHANGE.
 */
const CATALOG_QUERY_ATTEMPTS: readonly CatalogQuery[] = [
  {
    sort: "TVL",
    verifications: ["WHITELISTED", "COMMUNITY", "UNKNOWN"],
  },
  {
    sort: "TVL",
    verifications: ["WHITELISTED", "COMMUNITY"],
  },
  {
    sort: "PRICE_CHANGE_24H",
    verifications: ["WHITELISTED", "COMMUNITY"],
  },
];

/** Sticky query after first successful page so pagination stays consistent. */
let stickyCatalogQuery: CatalogQuery | null = null;

/** Clear sticky sort after a full catalog reset (TTL / hard reload). */
export function resetSwapJettonsCatalogQuery(): void {
  stickyCatalogQuery = null;
}

function tokensBaseUrl(): string {
  return SWAP_COFFEE_TOKENS_API_BASE.replace(/\/$/, "");
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Swap.Coffee tokens API ${res.status}: ${text.slice(0, 160)}`);
  }
  return JSON.parse(text) as T;
}

function isRetryableCatalogError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /\b400\b/.test(message) ||
    /Character I is neither a decimal digit/i.test(message) ||
    /Invalid value/i.test(message)
  );
}

function tokensPageUrl(page: number, query: CatalogQuery): string {
  // Always hit tokens.swap.coffee directly. Desktop used to proxy via
  // `/api/swap-coffee-tokens`, but Vercel egress is blocked/slowed by DDoS-Guard
  // (prod: FUNCTION_INVOCATION_TIMEOUT) while the origin returns ACAO: * for app://.
  //
  // Catalog uses Tokens API v3 hybrid-search (has `market_stats.mcap` + sort).
  // v2 `/api/v2/tokens` has no mcap field, so the UI sorted by ticker only.
  const url = new URL(`${tokensBaseUrl()}/api/v3/hybrid-search`);
  url.searchParams.set("kind", "DEXES");
  url.searchParams.set("sort", query.sort);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  for (const verification of query.verifications) {
    url.searchParams.append("verification", verification);
  }
  return url.toString();
}

function catalogAttempts(): CatalogQuery[] {
  if (!stickyCatalogQuery) return [...CATALOG_QUERY_ATTEMPTS];
  const rest = CATALOG_QUERY_ATTEMPTS.filter(
    (q) =>
      q.sort !== stickyCatalogQuery!.sort ||
      q.verifications.join(",") !== stickyCatalogQuery!.verifications.join(","),
  );
  return [stickyCatalogQuery, ...rest];
}

async function fetchSwapJettonsPageWithQuery(
  page: number,
  query: CatalogQuery,
  started: number,
): Promise<{ items: SwapJetton[]; hasMore: boolean }> {
  const url = tokensPageUrl(page, query);
  logPageDisplay("swap_jettons_page_fetch", {
    page,
    desktopShell: isDesktopAppShell(),
    via: "direct",
    host: (() => {
      try {
        return new URL(url).host;
      } catch {
        return "";
      }
    })(),
    api: "v3/hybrid-search",
    sort: query.sort,
    verifications: query.verifications.join("+"),
  });
  const res = await swapCoffeeFetch(url);
  const data = await parseJsonResponse<unknown>(res);
  const mapped = mapSwapCoffeeHybridSearchPage(data, PAGE_SIZE);
  logPageDisplay("swap_jettons_page_ok", {
    page,
    count: mapped.items.length,
    hasMore: mapped.hasMore,
    elapsedMs: Date.now() - started,
    sort: query.sort,
    sampleMcap: mapped.items[0]?.market_stats?.mcap ?? null,
  });
  return mapped;
}

export async function fetchSwapJettonsPage(page: number): Promise<{
  items: SwapJetton[];
  hasMore: boolean;
}> {
  const started = Date.now();
  const attempts = catalogAttempts();
  let lastError: unknown;

  for (let i = 0; i < attempts.length; i += 1) {
    const query = attempts[i]!;
    try {
      const mapped = await fetchSwapJettonsPageWithQuery(page, query, started);
      stickyCatalogQuery = query;
      return mapped;
    } catch (err) {
      lastError = err;
      const retryable = isRetryableCatalogError(err) && i < attempts.length - 1;
      logPageDisplay("swap_jettons_page_error", {
        page,
        elapsedMs: Date.now() - started,
        sort: query.sort,
        message: err instanceof Error ? err.message : String(err),
        retrying: retryable,
      });
      if (!retryable) throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Swap.Coffee catalog failed"));
}

export async function fetchAllSwapJettons(
  onPage?: (jettons: SwapJetton[], page: number) => void,
): Promise<SwapJetton[]> {
  const seen = new Set<string>();
  const all: SwapJetton[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= MAX_PAGES) {
    const batch = await fetchSwapJettonsPage(page);
    if (batch.items.length === 0) break;

    for (const jetton of batch.items) {
      const key = jetton.address?.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(jetton);
    }

    onPage?.(all.slice(), page);
    hasMore = batch.hasMore;
    page += 1;
  }

  return all;
}

export async function fetchAccountSwapJettons(walletAddress: string): Promise<SwapAccountJettonsResponse> {
  const url = `${tokensBaseUrl()}/api/v3/accounts/${encodeURIComponent(walletAddress)}/jettons`;
  const started = Date.now();
  logPageDisplay("swap_account_jettons_fetch", {
    desktopShell: isDesktopAppShell(),
    via: "direct",
  });
  try {
    const res = await swapCoffeeFetch(url);
    const data = await parseJsonResponse<SwapAccountJettonsResponse>(res);
    logPageDisplay("swap_account_jettons_ok", {
      count: Array.isArray(data.items) ? data.items.length : 0,
      elapsedMs: Date.now() - started,
    });
    return data;
  } catch (err) {
    logPageDisplay("swap_account_jettons_error", {
      elapsedMs: Date.now() - started,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
