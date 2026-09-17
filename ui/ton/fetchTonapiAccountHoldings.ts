import { buildApiUrl } from "../../api/_base";
import { tonapiFetch } from "./tonapiClient";
import { fromNanoTon } from "./getTonBalance";

export type TonapiJettonMeta = {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  image?: string;
  verification?: string;
};

export type TonapiJettonBalance = {
  balance: string;
  jetton: TonapiJettonMeta;
  priceUsd: number | null;
};

export type TonapiAccountHoldings = {
  address: string;
  status: string | null;
  nativeBalance: number;
  nativeBalanceNano: string;
  tonPriceUsd: number | null;
  jettons: TonapiJettonBalance[];
};

type TonapiAccountResponse = {
  address?: string;
  balance?: number | string;
  status?: string;
};

type TonapiJettonsResponse = {
  balances?: Array<{
    balance?: string | number;
    price?: { prices?: Record<string, number> };
    jetton?: {
      address?: string;
      name?: string;
      symbol?: string;
      decimals?: number;
      image?: string;
      verification?: string;
    };
  }>;
};

type TonapiRatesResponse = {
  rates?: Record<string, { prices?: Record<string, number> }>;
};

type ApiHoldingsResponse = TonapiAccountHoldings & { ok?: boolean; error?: string };

const HOLDINGS_CACHE_TTL_MS = 30_000;
const holdingsInFlight = new Map<string, Promise<TonapiAccountHoldings>>();
const holdingsCache = new Map<string, { at: number; value: TonapiAccountHoldings }>();

function holdingsCacheKey(address: string): string {
  return address.trim().toLowerCase();
}

function emptyHoldings(address: string): TonapiAccountHoldings {
  return {
    address,
    status: null,
    nativeBalance: 0,
    nativeBalanceNano: "0",
    tonPriceUsd: null,
    jettons: [],
  };
}

function readUsdPrice(prices: Record<string, number> | undefined): number | null {
  if (!prices) return null;
  const usd = prices.USD ?? prices.usd;
  return typeof usd === "number" && Number.isFinite(usd) && usd > 0 ? usd : null;
}

async function fetchTonapiAccountHoldingsDirect(
  walletAddress: string,
): Promise<TonapiAccountHoldings> {
  const trimmed = walletAddress.trim();
  const accountPath = `/accounts/${encodeURIComponent(trimmed)}`;
  const jettonsPath = `/accounts/${encodeURIComponent(trimmed)}/jettons?currencies=usd`;
  const ratesPath = `/rates?tokens=ton&currencies=usd`;

  const [accountRes, jettonsRes, ratesRes] = await Promise.all([
    tonapiFetch(accountPath),
    tonapiFetch(jettonsPath),
    tonapiFetch(ratesPath),
  ]);

  if (!accountRes.ok) {
    throw new Error(`TonAPI account ${accountRes.status}`);
  }

  const account = (await accountRes.json()) as TonapiAccountResponse;
  const nativeNano = String(account.balance ?? 0);
  const nativeBalance = fromNanoTon(nativeNano);

  let tonPriceUsd: number | null = null;
  if (ratesRes.ok) {
    try {
      const rates = (await ratesRes.json()) as TonapiRatesResponse;
      tonPriceUsd = readUsdPrice(rates.rates?.TON?.prices ?? rates.rates?.ton?.prices);
    } catch {
      tonPriceUsd = null;
    }
  }

  const jettons: TonapiJettonBalance[] = [];
  if (jettonsRes.ok) {
    const data = (await jettonsRes.json()) as TonapiJettonsResponse;
    for (const row of data.balances ?? []) {
      const jetton = row.jetton;
      const address = jetton?.address?.trim();
      const symbol = jetton?.symbol?.trim();
      if (!address || !symbol) continue;
      const balanceRaw = String(row.balance ?? "0");
      try {
        if (BigInt(balanceRaw) <= 0n) continue;
      } catch {
        continue;
      }
      jettons.push({
        balance: balanceRaw,
        jetton: {
          address,
          name: jetton?.name,
          symbol,
          decimals: typeof jetton?.decimals === "number" ? jetton.decimals : 9,
          image: jetton?.image,
          verification: jetton?.verification,
        },
        priceUsd: readUsdPrice(row.price?.prices),
      });
    }
  }

  return {
    address: account.address ?? trimmed,
    status: account.status ?? null,
    nativeBalance,
    nativeBalanceNano: nativeNano,
    tonPriceUsd,
    jettons,
  };
}

/**
 * Native GRAM + jetton balances via our `/api/ton-account-holdings` proxy (server TonAPI key),
 * with a direct TonAPI fallback only when the proxy is unreachable (not on 429/502).
 * In-flight requests and a short TTL cache dedupe parallel callers (header + menu).
 */
export async function fetchTonapiAccountHoldings(
  walletAddress: string,
): Promise<TonapiAccountHoldings> {
  const trimmed = walletAddress.trim();
  if (!trimmed) return emptyHoldings("");

  const key = holdingsCacheKey(trimmed);
  const cached = holdingsCache.get(key);
  if (cached && Date.now() - cached.at < HOLDINGS_CACHE_TTL_MS) {
    return cached.value;
  }

  const existing = holdingsInFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<TonapiAccountHoldings> => {
    try {
      const url = buildApiUrl(
        `/api/ton-account-holdings?address=${encodeURIComponent(trimmed)}`,
      );
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as ApiHoldingsResponse;
        if (data && typeof data.nativeBalance === "number") {
          const value: TonapiAccountHoldings = {
            address: data.address ?? trimmed,
            status: data.status ?? null,
            nativeBalance: data.nativeBalance,
            nativeBalanceNano: data.nativeBalanceNano ?? "0",
            tonPriceUsd: data.tonPriceUsd ?? null,
            jettons: Array.isArray(data.jettons) ? data.jettons : [],
          };
          holdingsCache.set(key, { at: Date.now(), value });
          return value;
        }
      }
      // Proxy reachable but failed (429/502/etc.): keep cache if any; otherwise try direct TonAPI.
      if (res.status !== 404 && cached?.value) {
        return cached.value;
      }
    } catch {
      /* network / CORS — try direct TonAPI once */
    }

    try {
      const value = await fetchTonapiAccountHoldingsDirect(trimmed);
      holdingsCache.set(key, { at: Date.now(), value });
      return value;
    } catch {
      return cached?.value ?? emptyHoldings(trimmed);
    }
  })().finally(() => {
    holdingsInFlight.delete(key);
  });

  holdingsInFlight.set(key, promise);
  return promise;
}
