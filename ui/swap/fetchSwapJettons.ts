import { isDesktopAppShell } from "../appShell";
import { logPageDisplay } from "../pageDisplayLog";
import { mapSwapCoffeeHybridSearchPage } from "./mapSwapCoffeeHybridSearch";
import { SWAP_COFFEE_TOKENS_API_BASE } from "./swapChartConstants";
import { swapCoffeeFetch } from "./swapCoffeeFetch";
import type { SwapAccountJettonsResponse, SwapJetton } from "./swapJettonsTypes";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

/** Include every non-blacklisted verification so community tokens stay in the catalog. */
const CATALOG_VERIFICATIONS = ["WHITELISTED", "COMMUNITY", "UNKNOWN"] as const;

/**
 * Upstream `sort=MCAP` with community/unknown returns fantasy supply×price junk on
 * early pages (filters wipe the page). Sort by TVL so each page is liquid enough to
 * map real `mcap` / volume; the choose-currency UI re-sorts by market-cap rank.
 */
const CATALOG_SORT = "TVL";

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

function tokensPageUrl(page: number): string {
  // Always hit tokens.swap.coffee directly. Desktop used to proxy via
  // `/api/swap-coffee-tokens`, but Vercel egress is blocked/slowed by DDoS-Guard
  // (prod: FUNCTION_INVOCATION_TIMEOUT) while the origin returns ACAO: * for app://.
  //
  // Catalog uses Tokens API v3 hybrid-search (has `market_stats.mcap` + sort).
  // v2 `/api/v2/tokens` has no mcap field, so the UI sorted by ticker only.
  const url = new URL(`${tokensBaseUrl()}/api/v3/hybrid-search`);
  url.searchParams.set("kind", "DEXES");
  url.searchParams.set("sort", CATALOG_SORT);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  for (const verification of CATALOG_VERIFICATIONS) {
    url.searchParams.append("verification", verification);
  }
  return url.toString();
}

export async function fetchSwapJettonsPage(page: number): Promise<{
  items: SwapJetton[];
  hasMore: boolean;
}> {
  const url = tokensPageUrl(page);
  const started = Date.now();
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
    sort: CATALOG_SORT,
  });
  try {
    const res = await swapCoffeeFetch(url);
    const data = await parseJsonResponse<unknown>(res);
    const mapped = mapSwapCoffeeHybridSearchPage(data, PAGE_SIZE);
    logPageDisplay("swap_jettons_page_ok", {
      page,
      count: mapped.items.length,
      hasMore: mapped.hasMore,
      elapsedMs: Date.now() - started,
      sampleMcap: mapped.items[0]?.market_stats?.mcap ?? null,
    });
    return mapped;
  } catch (err) {
    logPageDisplay("swap_jettons_page_error", {
      page,
      elapsedMs: Date.now() - started,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
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
