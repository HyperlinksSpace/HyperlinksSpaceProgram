/**
 * App jetton shape for the swap currency picker.
 * Catalog is mapped from Tokens API v2 (`/api/v2/tokens`); verification is derived
 * from `trust_score` when the upstream field is absent.
 */

export type SwapJettonVerification = "BLACKLISTED" | "UNKNOWN" | "COMMUNITY" | "WHITELISTED";

export type SwapJettonMarketStats = {
  holders_count?: number;
  price_usd?: number;
  price_change_5m?: number;
  price_change_1h?: number;
  price_change_6h?: number;
  price_change_24h?: number;
  price_change_7d?: number;
  volume_usd_24h?: number;
  tvl_usd?: number;
  fdmc?: number;
  mcap?: number;
  trust_score?: number;
};

export type SwapJetton = {
  address: string;
  name?: string;
  symbol?: string;
  decimals: number;
  image_url?: string;
  verification?: SwapJettonVerification;
  market_stats?: SwapJettonMarketStats;
};

export type SwapAccountJettonBalance = {
  balance: string;
  jetton_address: string;
  jetton_wallet: string;
  jetton?: SwapJetton;
};

export type SwapAccountJettonsResponse = {
  items: SwapAccountJettonBalance[];
};
