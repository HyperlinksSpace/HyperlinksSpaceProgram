import { Address, beginCell, toNano } from "@ton/core";

import { isNativeTonToken, type SwapPairToken } from "../swap/swapPairTypes";
import { resolveJettonWalletAddress } from "./jettonWalletAddress";
import { parseTokenAmountToUnits } from "./parseTokenAmount";
import type { TonConnectTransactionRequest } from "./TonConnectProvider";

const TONCONNECT_MAINNET = "-239";
const JETTON_TRANSFER_OP = 0x0f8a7ea5;

function buildTextCommentCell(comment: string) {
  return beginCell().storeUint(0, 32).storeStringTail(comment).endCell();
}

function buildJettonTransferBody(params: {
  toOwner: Address;
  amount: bigint;
  responseOwner: Address;
  forwardTonAmount?: bigint;
  queryId?: bigint;
  comment?: string;
}) {
  const builder = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(params.queryId ?? 0n, 64)
    .storeCoins(params.amount)
    .storeAddress(params.toOwner)
    .storeAddress(params.responseOwner)
    .storeBit(0)
    .storeCoins(params.forwardTonAmount ?? toNano("0.05"));

  const comment = params.comment?.trim() ?? "";
  if (comment) {
    builder.storeBit(1).storeRef(buildTextCommentCell(comment));
  } else {
    builder.storeBit(0);
  }
  return builder.endCell();
}

/**
 * Build a TonConnect sendTransaction request for a native TON or jetton transfer
 * ([ton-connect/sdk](https://github.com/ton-connect/sdk)).
 */
export async function buildSendTransferTransaction(opts: {
  amount: string;
  token: SwapPairToken;
  fromWalletAddress: string;
  toAddress: string;
  comment?: string;
}): Promise<TonConnectTransactionRequest> {
  const to = opts.toAddress.trim();
  const from = opts.fromWalletAddress.trim();
  if (!to || !from) {
    throw new Error("missing_wallet_address");
  }

  const units = parseTokenAmountToUnits(opts.amount, opts.token.decimals);
  if (units == null) {
    throw new Error("invalid_amount");
  }

  const toAddr = Address.parse(to);
  const fromAddr = Address.parse(from);
  const validUntil = Math.floor(Date.now() / 1000) + 300;
  const comment = opts.comment?.trim() ?? "";

  if (isNativeTonToken(opts.token)) {
    const bounceable = to.trim().startsWith("EQ");
    return {
      validUntil,
      network: TONCONNECT_MAINNET,
      messages: [
        {
          address: toAddr.toString({ urlSafe: true, bounceable }),
          amount: units.toString(),
          ...(comment
            ? { payload: buildTextCommentCell(comment).toBoc().toString("base64") }
            : null),
        },
      ],
    };
  }

  const jettonMaster = opts.token.address.trim();
  if (!jettonMaster) {
    throw new Error("missing_jetton_address");
  }

  const senderJettonWallet = await resolveJettonWalletAddress(jettonMaster, from);
  const body = buildJettonTransferBody({
    toOwner: toAddr,
    amount: units,
    responseOwner: fromAddr,
    comment: comment || undefined,
  });

  return {
    validUntil,
    network: TONCONNECT_MAINNET,
    messages: [
      {
        address: senderJettonWallet,
        amount: toNano("0.08").toString(),
        payload: body.toBoc().toString("base64"),
      },
    ],
  };
}
