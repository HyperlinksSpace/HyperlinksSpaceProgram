import { buildApiUrl } from "../../api/_base";
import {
  bumpWalletBalanceRefresh,
  scheduleWalletBalanceRefreshBurst,
} from "../wallet/walletBalanceRefresh";
import { applyServerDllrLedgerFromSession } from "../pro/dllrBalanceStore";

export type WalletSendClientResult =
  | {
      ok: true;
      seqno?: number;
      fromAddress: string;
      toAddress?: string;
      asset?: "dllr" | "chain";
      amountUsd?: number;
      comment?: string;
      dllrHotUsd?: number;
      dllrFrozenUsd?: number;
      dllrBalanceUsd?: number;
      recipientDllrHotUsd?: number;
      recipientDllrFrozenUsd?: number;
      recipientDllrBalanceUsd?: number;
      toUsername?: string;
    }
  | { ok: false; error: string };

/**
 * Ask the server to transfer from the built-in wallet:
 * - DLLR → ledger transfer between HSP built-in wallets
 * - otherwise → @ton/ton WalletContractV4 on-chain send
 */
export async function requestWalletSend(opts: {
  toAddress: string;
  amount: string;
  decimals: number;
  jettonMasterAddress?: string | null;
  /** When true, server moves DLLR ledger balances (no chain tx). */
  dllr?: boolean;
  comment?: string;
  initDataRaw?: string | null;
}): Promise<WalletSendClientResult> {
  const trimmedInit = typeof opts.initDataRaw === "string" ? opts.initDataRaw.trim() : "";
  const body: Record<string, unknown> = {
    toAddress: opts.toAddress.trim(),
    amount: opts.amount.trim(),
    decimals: opts.decimals,
  };
  if (opts.dllr) {
    body.asset = "dllr";
    // Backup signal if `asset` is stripped by a proxy — server also treats this as DLLR.
    body.jettonMasterAddress = "jetton:dllr";
  } else if (opts.jettonMasterAddress?.trim()) {
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
      toAddress?: string;
      toUsername?: string;
      asset?: string;
      amountUsd?: number;
      comment?: string;
      error?: string;
      dllr_hot_usd?: number;
      dllr_frozen_usd?: number;
      dllr_balance_usd?: number;
      recipient_dllr_hot_usd?: number;
      recipient_dllr_frozen_usd?: number;
      recipient_dllr_balance_usd?: number;
    } | null;

    if (
      typeof data?.dllr_hot_usd === "number" &&
      typeof data?.dllr_frozen_usd === "number"
    ) {
      applyServerDllrLedgerFromSession({
        hotUsd: data.dllr_hot_usd,
        frozenUsd: data.dllr_frozen_usd,
      });
    }

    if (res.ok && data?.ok) {
      const isDllr = data.asset === "dllr";
      if (!isDllr && typeof data.seqno !== "number") {
        return {
          ok: false,
          error: typeof data?.error === "string" ? data.error : `http_${res.status}`,
        };
      }
      bumpWalletBalanceRefresh();
      scheduleWalletBalanceRefreshBurst([3_000, 12_000, 30_000]);
      return {
        ok: true,
        seqno: typeof data.seqno === "number" ? data.seqno : undefined,
        fromAddress: typeof data.fromAddress === "string" ? data.fromAddress : "",
        toAddress: typeof data.toAddress === "string" ? data.toAddress : opts.toAddress.trim(),
        asset: isDllr ? "dllr" : "chain",
        amountUsd: typeof data.amountUsd === "number" ? data.amountUsd : undefined,
        comment: typeof data.comment === "string" ? data.comment : undefined,
        dllrHotUsd: data.dllr_hot_usd,
        dllrFrozenUsd: data.dllr_frozen_usd,
        dllrBalanceUsd: data.dllr_balance_usd,
        recipientDllrHotUsd: data.recipient_dllr_hot_usd,
        recipientDllrFrozenUsd: data.recipient_dllr_frozen_usd,
        recipientDllrBalanceUsd: data.recipient_dllr_balance_usd,
        toUsername: typeof data.toUsername === "string" ? data.toUsername : undefined,
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
