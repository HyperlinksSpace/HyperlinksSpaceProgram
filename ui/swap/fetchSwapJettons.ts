import { isDesktopAppShell } from "../appShell";
import { logPageDisplay } from "../pageDisplayLog";
import { mapSwapCoffeeTokensPageV2 } from "./mapSwapCoffeeTokenV2";
import { SWAP_COFFEE_TOKENS_API_BASE } from "./swapChartConstants";
import { swapCoffeeFetch } from "./swapCoffeeFetch";
import type { SwapAccountJettonsResponse, SwapJetton } from "./swapJettonsTypes";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

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
  // Use Tokens API v2 (`/api/v2/tokens`). v3 `/api/v3/jettons` currently 400s on
  // every request (server-side decimal parse error) and is absent from OpenAPI.
  const url = new URL(`${tokensBaseUrl()}/api/v2/tokens`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
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
    api: "v2/tokens",
  });
  try {
    const res = await swapCoffeeFetch(url);
    const data = await parseJsonResponse<unknown>(res);
    const mapped = mapSwapCoffeeTokensPageV2(data);
    logPageDisplay("swap_jettons_page_ok", {
      page,
      count: mapped.items.length,
      hasMore: mapped.hasMore,
      elapsedMs: Date.now() - started,
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
