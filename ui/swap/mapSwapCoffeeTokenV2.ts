import type { SwapJetton, SwapJettonVerification } from "./swapJettonsTypes";

/** Swap.Coffee Tokens API v2 `BlockchainTokenRead` (subset used by the app). */
export type SwapCoffeeTokenV2 = {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  image?: string | null;
  price_usd?: number | null;
  price_change_24h?: number | null;
  tvl?: number | null;
  holders_count?: number | null;
  trust_score?: number | null;
};

export type SwapCoffeeTokensPageV2 = {
  items?: SwapCoffeeTokenV2[];
  total?: number | null;
  page?: number | null;
  size?: number | null;
  pages?: number | null;
};

/** Map v2 trust_score onto the verification labels the UI already filters on. */
export function trustScoreToVerification(
  trust: number | null | undefined,
): SwapJettonVerification {
  if (trust == null || !Number.isFinite(trust)) return "UNKNOWN";
  if (trust >= 90) return "WHITELISTED";
  if (trust >= 50) return "COMMUNITY";
  return "UNKNOWN";
}

export function mapSwapCoffeeTokenV2ToJetton(token: SwapCoffeeTokenV2): SwapJetton | null {
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
    image_url: typeof token.image === "string" && token.image ? token.image : undefined,
    verification: trustScoreToVerification(token.trust_score),
    market_stats: {
      holders_count:
        typeof token.holders_count === "number" && Number.isFinite(token.holders_count)
          ? token.holders_count
          : undefined,
      price_usd:
        typeof token.price_usd === "number" && Number.isFinite(token.price_usd)
          ? token.price_usd
          : undefined,
      price_change_24h:
        typeof token.price_change_24h === "number" && Number.isFinite(token.price_change_24h)
          ? token.price_change_24h
          : undefined,
      tvl_usd:
        typeof token.tvl === "number" && Number.isFinite(token.tvl) ? token.tvl : undefined,
      trust_score:
        typeof token.trust_score === "number" && Number.isFinite(token.trust_score)
          ? token.trust_score
          : undefined,
    },
  };
}

export function mapSwapCoffeeTokensPageV2(data: unknown): {
  items: SwapJetton[];
  hasMore: boolean;
} {
  if (!data || typeof data !== "object") {
    throw new Error("Swap.Coffee tokens: unexpected payload");
  }
  const page = data as SwapCoffeeTokensPageV2;
  if (!Array.isArray(page.items)) {
    throw new Error("Swap.Coffee tokens: unexpected payload");
  }

  const items: SwapJetton[] = [];
  for (const raw of page.items) {
    const mapped = mapSwapCoffeeTokenV2ToJetton(raw);
    if (mapped) items.push(mapped);
  }

  const currentPage =
    typeof page.page === "number" && Number.isFinite(page.page) ? page.page : null;
  const totalPages =
    typeof page.pages === "number" && Number.isFinite(page.pages) ? page.pages : null;
  if (currentPage != null && totalPages != null) {
    return { items, hasMore: currentPage < totalPages };
  }

  const size =
    typeof page.size === "number" && Number.isFinite(page.size) && page.size > 0
      ? page.size
      : null;
  return {
    items,
    hasMore: size != null ? page.items.length >= size : page.items.length > 0,
  };
}
