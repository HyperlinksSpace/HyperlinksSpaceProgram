import { buildApiUrl } from "../../api/_base";
import {
  bumpWalletBalanceRefresh,
  scheduleWalletBalanceRefreshBurst,
} from "../wallet/walletBalanceRefresh";

export type WalletSendClientResult =
  | { ok: true; seqno: number; fromAddress: string }
  | { ok: false; error: string };

/**
 * Ask the server to transfer from the built-in wallet (@ton/ton WalletContractV4).
 */
export async function requestWalletSend(opts: {
  toAddress: string;
  amount: string;
  decimals: number;
  jettonMasterAddress?: string | null;
  comment?: string;
  initDataRaw?: string | null;
}): Promise<WalletSendClientResult> {
  const trimmedInit = typeof opts.initDataRaw === "string" ? opts.initDataRaw.trim() : "";
  const body: Record<string, unknown> = {
    toAddress: opts.toAddress.trim(),
    amount: opts.amount.trim(),
    decimals: opts.decimals,
  };
  if (opts.jettonMasterAddress?.trim()) {
    body.jettonMasterAddress = opts.jettonMasterAddress.trim();
  }
  if (opts.comment?.trim()) {
    body.comment = opts.comment.trim();
  }
  if (trimmedInit) body.initData = trimmedInit;

  try {
    const res = await fetch(buildApiUrl("/api/wallet-send"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      seqno?: number;
      fromAddress?: string;
      error?: string;
    } | null;

    if (res.ok && data?.ok && typeof data.seqno === "number") {
      bumpWalletBalanceRefresh();
      scheduleWalletBalanceRefreshBurst([3_000, 12_000, 30_000]);
      return {
        ok: true,
        seqno: data.seqno,
        fromAddress: typeof data.fromAddress === "string" ? data.fromAddress : "",
      };
    }
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : `http_${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}
