import { RoutingApi, type ApiTokenAddress } from "@swap-coffee/sdk";

import {
  sendSwapCoffeeTransactions,
  type SwapCoffeeTxMessage,
} from "../wallet/tonSwapSend";

export type SwapExecuteToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
};

export type ExecuteSwapParams = {
  fromToken: SwapExecuteToken;
  toToken: SwapExecuteToken;
  fromAmount: string;
  slippage?: number;
  senderAddress: string;
  mnemonic: string[];
  tonRpcUrl: string;
  tonRpcKey?: string;
};

export type ExecuteSwapResult = {
  success: boolean;
  routeId?: string;
  error?: string;
  routeStatus?: string;
};

const routingApi = new RoutingApi();

function isNativeTonAddress(address: string, isNative?: boolean): boolean {
  const addr = address.trim().toLowerCase();
  if (isNative && !addr) return true;
  return (
    addr === "native" ||
    addr === "0:0000000000000000000000000000000000000000000000000000000000000000" ||
    /^0:0+$/.test(addr) ||
    addr.includes("00000000000000000000000000000000000000000000000000000000")
  );
}

function toApiTokenAddress(token: SwapExecuteToken): ApiTokenAddress {
  if (isNativeTonAddress(token.address, token.isNative)) {
    return { blockchain: "ton", address: "native" };
  }
  return { blockchain: "ton", address: token.address };
}

/**
 * Mirror of whatswap `swap-service.ts` without TonConnect:
 * buildRoute → buildTransactionsV2 → wallet sendTransfer.
 */
export async function executeSwap(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
  try {
    const inputAmount = Number(String(params.fromAmount).replace(",", ".").trim());
    if (!(inputAmount > 0) || !Number.isFinite(inputAmount)) {
      return { success: false, error: "invalid_amount" };
    }
    if (!params.senderAddress.trim()) {
      return { success: false, error: "wallet_required" };
    }
    if (!params.mnemonic.length) {
      return { success: false, error: "wallet_locked" };
    }

    const input_token = toApiTokenAddress(params.fromToken);
    const output_token = toApiTokenAddress(params.toToken);
    const route = await routingApi.buildRoute({
      input_token,
      output_token,
      input_amount: inputAmount,
      max_splits: 4,
    });
    const quote = route.data as { paths?: unknown } | null;
    if (!quote?.paths) {
      return { success: false, error: "no_route" };
    }

    const transactions = await routingApi.buildTransactionsV2({
      sender_address: params.senderAddress.trim(),
      slippage: params.slippage ?? 0.1,
      paths: quote.paths as never,
    });

    const data = transactions.data as {
      route_id?: string;
      transactions?: SwapCoffeeTxMessage[];
    } | null;

    if (!data?.transactions?.length) {
      return { success: false, error: "failed_to_build_transactions" };
    }

    await sendSwapCoffeeTransactions({
      mnemonic: params.mnemonic,
      transactions: data.transactions,
      endpoint: params.tonRpcUrl,
      apiKey: params.tonRpcKey,
      expectedFromAddress: params.senderAddress.trim(),
    });

    return {
      success: true,
      routeId: data.route_id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "swap_failed",
    };
  }
}

/** Server-side: build txs only (signing happens after envelope unwrap). */
export async function buildSwapCoffeeTransactionsForSender(opts: {
  fromToken: SwapExecuteToken;
  toToken: SwapExecuteToken;
  fromAmount: string;
  senderAddress: string;
  slippage?: number;
}): Promise<{
  routeId: string;
  transactions: SwapCoffeeTxMessage[];
  inputAmount: number;
  outputAmount: number;
}> {
  const inputAmount = Number(String(opts.fromAmount).replace(",", ".").trim());
  if (!(inputAmount > 0) || !Number.isFinite(inputAmount)) {
    throw new Error("invalid_amount");
  }

  const route = await routingApi.buildRoute({
    input_token: toApiTokenAddress(opts.fromToken),
    output_token: toApiTokenAddress(opts.toToken),
    input_amount: inputAmount,
    max_splits: 4,
  });
  const quote = route.data as {
    paths?: unknown;
    input_amount?: number | string;
    output_amount?: number | string;
  } | null;
  if (!quote?.paths) {
    throw new Error("no_route");
  }

  const transactions = await routingApi.buildTransactionsV2({
    sender_address: opts.senderAddress.trim(),
    slippage: opts.slippage ?? 0.1,
    paths: quote.paths as never,
  });

  const data = transactions.data as {
    route_id?: string;
    transactions?: SwapCoffeeTxMessage[];
  } | null;

  if (!data?.route_id || !data.transactions?.length) {
    throw new Error("failed_to_build_transactions");
  }

  return {
    routeId: data.route_id,
    transactions: data.transactions,
    inputAmount: Number(quote.input_amount) || inputAmount,
    outputAmount: Number(quote.output_amount) || 0,
  };
}
