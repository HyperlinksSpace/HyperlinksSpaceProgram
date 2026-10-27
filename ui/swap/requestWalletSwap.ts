import { buildApiUrl } from "../../api/_base";
import type { SwapPairToken } from "./swapPairTypes";

export type WalletSwapClientResult =
  | { ok: true; routeId?: string; routeStatus?: string }
  | { ok: false; error: string };

function tokenPayload(token: SwapPairToken) {
  return {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    isNative: Boolean(token.isNative),
  };
}

/** Built-in wallet swap: server unwraps KMS mnemonic and broadcasts Swap.Coffee txs. */
export async function requestWalletSwap(opts: {
  fromToken: SwapPairToken;
  toToken: SwapPairToken;
  fromAmount: string;
  slippage?: number;
  initDataRaw?: string | null;
}): Promise<WalletSwapClientResult> {
  const trimmedInit = typeof opts.initDataRaw === "string" ? opts.initDataRaw.trim() : "";
  const body: Record<string, unknown> = {
    fromToken: tokenPayload(opts.fromToken),
    toToken: tokenPayload(opts.toToken),
    fromAmount: opts.fromAmount.trim(),
    slippage: opts.slippage ?? 0.1,
  };
  if (trimmedInit) body.initData = trimmedInit;

  try {
    const res = await fetch(buildApiUrl("/api/wallet-swap"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      routeId?: string;
      routeStatus?: string;
    } | null;
    if (res.ok && data?.ok) {
      return {
        ok: true,
        routeId: typeof data.routeId === "string" ? data.routeId : undefined,
        routeStatus: typeof data.routeStatus === "string" ? data.routeStatus : undefined,
      };
    }
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "swap_failed" };
  }
}
