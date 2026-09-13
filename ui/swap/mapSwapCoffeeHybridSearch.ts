import type { SwapJetton, SwapJettonMarketStats, SwapJettonVerification } from "./swapJettonsTypes";

/** Swap.Coffee Tokens API v3 hybrid-search `common` / `memepad` jetton (subset). */
export type SwapCoffeeHybridJetton = {
  type?: string;
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  image_url?: string | null;
  verification?: string | null;
  market_stats?: Record<string, unknown> | null;
};

const VERIFICATIONS = new Set<SwapJettonVerification>([
  "BLACKLISTED",
  "UNKNOWN",
  "COMMUNITY",
  "WHITELISTED",
]);

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapVerification(raw: string | null | undefined): SwapJettonVerification {
  const upper = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (VERIFICATIONS.has(upper as SwapJettonVerification)) {
    return upper as SwapJettonVerification;
  }
  return "UNKNOWN";
}

function mapMarketStats(
  raw: Record<string, unknown> | null | undefined,
): SwapJettonMarketStats | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  // Memepad jettons expose `fdmc_usd`; DEX commons use `fdmc` / `mcap`.
  const fdmc = readNumber(raw.fdmc) ?? readNumber(raw.fdmc_usd);
  const mcap = readNumber(raw.mcap) ?? readNumber(raw.mcap_usd) ?? fdmc;
  const tvl = readNumber(raw.tvl_usd) ?? readNumber(raw.tvl);

  const stats: SwapJettonMarketStats = {
    holders_count: readNumber(raw.holders_count),
    price_usd: readNumber(raw.price_usd),
    price_change_5m: readNumber(raw.price_change_5m),
    price_change_1h: readNumber(raw.price_change_1h),
    price_change_6h: readNumber(raw.price_change_6h),
    price_change_24h: readNumber(raw.price_change_24h),
    price_change_7d: readNumber(raw.price_change_7d),
    volume_usd_24h: readNumber(raw.volume_usd_24h),
    tvl_usd: tvl,
    fdmc,
    mcap,
    trust_score: readNumber(raw.trust_score),
  };

  return stats;
}

export function mapSwapCoffeeHybridJettonToJetton(
  token: SwapCoffeeHybridJetton,
): SwapJetton | null {
  const address = typeof token.address === "string" ? token.address.trim() : "";
  if (!address) return null;
  const decimals =
    typeof token.decimals === "number" && Number.isFinite(token.decimals)
      ? token.decimals
      : 9;

  return {
    address,
    name: typeof token.name === "string" ? token.name : undefined,
    symbol: typeof token.symbol === "string" ? token.symbol : undefined,
    decimals,
    image_url:
      typeof token.image_url === "string" && token.image_url
        ? token.image_url
        : undefined,
    verification: mapVerification(token.verification),
    market_stats: mapMarketStats(token.market_stats),
  };
}

/**
 * Hybrid-search returns a bare array (not `{ items, page, pages }`).
 * `hasMore` is inferred from a full page.
 */
export function mapSwapCoffeeHybridSearchPage(
  data: unknown,
  pageSize: number,
): {
  items: SwapJetton[];
  hasMore: boolean;
} {
  if (!Array.isArray(data)) {
    throw new Error("Swap.Coffee hybrid-search: unexpected payload");
  }

  const items: SwapJetton[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const mapped = mapSwapCoffeeHybridJettonToJetton(raw as SwapCoffeeHybridJetton);
    if (mapped) items.push(mapped);
  }

  const size = pageSize > 0 ? pageSize : 100;
  return {
    items,
    hasMore: data.length >= size,
  };
}
