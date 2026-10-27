import {
  mapSwapCoffeeTransactionsToTonConnect,
  sendSwapCoffeeTransactions,
  type SwapCoffeeTxMessage,
} from "../../services/wallet/tonSwapSend";
import type { TonConnectSession } from "../ton/TonConnectProvider";
import { readImportedWalletMnemonic } from "../wallet/importedWalletsStore";
import { buildSwapRouteQuote, swapCoffeeRoutingApi } from "./swapCoffeeRouting";
import { isDllrToken, type SwapPairToken } from "./swapPairTypes";
import { requestWalletSwap } from "./requestWalletSwap";

export type SwapWalletKind = "builtin" | "imported" | "tonconnect";

export type ExecuteSwapOnWalletParams = {
  kind: SwapWalletKind;
  senderAddress: string;
  fromToken: SwapPairToken;
  toToken: SwapPairToken;
  fromAmount: string;
  slippage?: number;
  initDataRaw?: string | null;
  tonConnect?: TonConnectSession;
};

export type ExecuteSwapOnWalletResult =
  | { ok: true; routeId?: string }
  | { ok: false; error: string };

const TONCONNECT_NETWORK = "-239";

async function buildCoffeeTransactions(opts: {
  fromToken: SwapPairToken;
  toToken: SwapPairToken;
  fromAmount: number;
  senderAddress: string;
  slippage: number;
}): Promise<{ routeId: string; transactions: SwapCoffeeTxMessage[] }> {
  const quote = await buildSwapRouteQuote({
    sellToken: opts.fromToken,
    buyToken: opts.toToken,
    amount: opts.fromAmount,
    direction: "exact_in",
  });
  const transactions = await swapCoffeeRoutingApi.buildTransactionsV2({
    sender_address: opts.senderAddress.trim(),
    slippage: opts.slippage,
    paths: quote.paths as never,
  });
  const data = transactions.data as {
    route_id?: string;
    transactions?: SwapCoffeeTxMessage[];
  } | null;
  if (!data?.transactions?.length) {
    throw new Error("failed_to_build_transactions");
  }
  return {
    routeId: data.route_id ?? "",
    transactions: data.transactions,
  };
}

/**
 * Execute a Swap.Coffee swap for the active wallet:
 * built-in (KMS on server), imported (local mnemonic), connected (TonConnect confirm).
 */
export async function executeSwapOnWallet(
  params: ExecuteSwapOnWalletParams,
): Promise<ExecuteSwapOnWalletResult> {
  if (isDllrToken(params.fromToken) || isDllrToken(params.toToken)) {
    return { ok: false, error: "dllr_frozen" };
  }
  const inputAmount = Number(String(params.fromAmount).replace(",", ".").trim());
  if (!(inputAmount > 0) || !Number.isFinite(inputAmount)) {
    return { ok: false, error: "invalid_amount" };
  }
  const sender = params.senderAddress.trim();
  if (!sender) return { ok: false, error: "wallet_required" };
  const slippage = params.slippage ?? 0.1;

  try {
    if (params.kind === "builtin") {
      const result = await requestWalletSwap({
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: String(inputAmount),
        slippage,
        initDataRaw: params.initDataRaw,
      });
      return result.ok
        ? { ok: true, routeId: result.routeId }
        : { ok: false, error: result.error };
    }

    const built = await buildCoffeeTransactions({
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: inputAmount,
      senderAddress: sender,
      slippage,
    });

    if (params.kind === "imported") {
      const mnemonic = await readImportedWalletMnemonic(sender);
      if (!mnemonic?.length) {
        return { ok: false, error: "imported_mnemonic_missing" };
      }
      await sendSwapCoffeeTransactions({
        mnemonic,
        transactions: built.transactions,
        expectedFromAddress: sender,
      });
    } else {
      const ton = params.tonConnect;
      if (!ton?.connected || !ton.address) {
        await ton?.openConnectModal();
        return { ok: false, error: "wallet_required" };
      }
      const messages = mapSwapCoffeeTransactionsToTonConnect(built.transactions);
      await ton.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 5 * 60,
        network: TONCONNECT_NETWORK,
        messages,
      });
    }

    return { ok: true, routeId: built.routeId || undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "swap_failed" };
  }
}
