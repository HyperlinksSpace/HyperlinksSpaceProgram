/**
 * Client-side native TON / jetton transfer signed with a local mnemonic
 * (imported wallets). Matches Wallet V5R1 / V4 / V3R2 to the stored address.
 * Mnemonics never leave the device.
 */
import { Address, beginCell, SendMode, toNano, type MessageRelaxed } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import {
  internal,
  TonClient,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from "@ton/ton";
import { Buffer as BufferPolyfill } from "buffer";

import type { DerivedTonWalletVariant } from "../wallet/tonMnemonicImport";
import { parseTokenAmountToUnits } from "./parseTokenAmount";
import { resolveJettonWalletAddress } from "./jettonWalletAddress";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
}

const MAINNET_RPC = "https://toncenter.com/api/v2/jsonRPC";
const JETTON_TRANSFER_OP = 0x0f8a7ea5;
/** External wallet messages must include IGNORE_ERRORS (Wallet V5). */
const DEFAULT_SEND_MODE = SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS;

export type SendMnemonicTransferParams = {
  mnemonic: string[];
  toAddress: string;
  amount: string;
  decimals: number;
  /** When set, send this jetton master; otherwise native TON. */
  jettonMasterAddress?: string | null;
  comment?: string;
  /** Required: imported wallet address used to pick V5 / V4 / V3. */
  expectedFromAddress: string;
};

export type SendMnemonicTransferResult =
  | { ok: true; seqno: number; fromAddress: string; variant: DerivedTonWalletVariant }
  | { ok: false; error: string };

function getTonRpcClient(): TonClient {
  return new TonClient({ endpoint: MAINNET_RPC });
}

function buildTextCommentCell(comment: string) {
  return beginCell().storeUint(0, 32).storeStringTail(comment).endCell();
}

function buildJettonTransferBody(params: {
  toOwner: Address;
  amount: bigint;
  responseOwner: Address;
  comment?: string;
}) {
  const builder = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(0n, 64)
    .storeCoins(params.amount)
    .storeAddress(params.toOwner)
    .storeAddress(params.responseOwner)
    .storeBit(0)
    .storeCoins(toNano("0.05"));

  const comment = params.comment?.trim() ?? "";
  if (comment) {
    builder.storeBit(1).storeRef(buildTextCommentCell(comment));
  } else {
    builder.storeBit(0);
  }
  return builder.endCell();
}

type MatchedWallet = {
  variant: DerivedTonWalletVariant;
  address: Address;
  getSeqno: () => Promise<number>;
  sendMessages: (seqno: number, secretKey: Buffer, messages: MessageRelaxed[]) => Promise<void>;
};

function matchWalletContract(
  client: TonClient,
  publicKey: Buffer,
  expectedFrom: Address,
): MatchedWallet | null {
  const workchain = 0;
  const v5 = WalletContractV5R1.create({ workchain, publicKey });
  if (expectedFrom.equals(v5.address)) {
    const opened = client.open(v5);
    return {
      variant: "v5r1",
      address: v5.address,
      getSeqno: () => opened.getSeqno(),
      sendMessages: (seqno, secretKey, messages) =>
        opened.sendTransfer({
          seqno,
          secretKey,
          messages,
          sendMode: DEFAULT_SEND_MODE,
        }),
    };
  }

  const v4 = WalletContractV4.create({ workchain, publicKey });
  if (expectedFrom.equals(v4.address)) {
    const opened = client.open(v4);
    return {
      variant: "v4r2",
      address: v4.address,
      getSeqno: () => opened.getSeqno(),
      sendMessages: (seqno, secretKey, messages) =>
        opened.sendTransfer({
          seqno,
          secretKey,
          messages,
          sendMode: DEFAULT_SEND_MODE,
        }),
    };
  }

  const v3 = WalletContractV3R2.create({ workchain, publicKey });
  if (expectedFrom.equals(v3.address)) {
    const opened = client.open(v3);
    return {
      variant: "v3r2",
      address: v3.address,
      getSeqno: () => opened.getSeqno(),
      sendMessages: (seqno, secretKey, messages) =>
        opened.sendTransfer({
          seqno,
          secretKey,
          messages,
          sendMode: DEFAULT_SEND_MODE,
        }),
    };
  }

  return null;
}

/**
 * Sign + broadcast a native TON or jetton transfer with a local mnemonic
 * via [@ton/ton](https://github.com/ton-org/ton) (same stack as built-in, client-side).
 */
export async function sendMnemonicTransfer(
  opts: SendMnemonicTransferParams,
): Promise<SendMnemonicTransferResult> {
  if (!opts.mnemonic.length) {
    return { ok: false, error: "missing_mnemonic" };
  }

  const units = parseTokenAmountToUnits(opts.amount, opts.decimals);
  if (units == null) {
    return { ok: false, error: "invalid_amount" };
  }

  let toAddr: Address;
  let expectedFrom: Address;
  try {
    toAddr = Address.parse(opts.toAddress.trim());
  } catch {
    return { ok: false, error: "invalid_to_address" };
  }
  try {
    expectedFrom = Address.parse(opts.expectedFromAddress.trim());
  } catch {
    return { ok: false, error: "invalid_expected_address" };
  }

  const keyPair = await mnemonicToPrivateKey(opts.mnemonic);
  const client = getTonRpcClient();
  const wallet = matchWalletContract(client, keyPair.publicKey, expectedFrom);
  if (!wallet) {
    return { ok: false, error: "address_mismatch" };
  }

  const seqno = await wallet.getSeqno();
  const comment = opts.comment?.trim() ?? "";
  const jettonMaster = opts.jettonMasterAddress?.trim() ?? "";

  try {
    if (!jettonMaster) {
      await wallet.sendMessages(seqno, keyPair.secretKey, [
        internal({
          to: toAddr,
          value: units,
          bounce: false,
          body: comment ? buildTextCommentCell(comment) : undefined,
        }),
      ]);
    } else {
      const senderJettonWalletRaw = await resolveJettonWalletAddress(
        jettonMaster,
        wallet.address.toString({ urlSafe: true, bounceable: false }),
      );
      const senderJettonWallet = Address.parse(senderJettonWalletRaw);
      const body = buildJettonTransferBody({
        toOwner: toAddr,
        amount: units,
        responseOwner: wallet.address,
        comment: comment || undefined,
      });
      await wallet.sendMessages(seqno, keyPair.secretKey, [
        internal({
          to: senderJettonWallet,
          value: toNano("0.08"),
          bounce: true,
          body,
        }),
      ]);
    }
  } catch (error) {
    console.warn("[send-mnemonic-transfer] broadcast failed", error);
    return { ok: false, error: "broadcast_failed" };
  }

  return {
    ok: true,
    seqno,
    fromAddress: wallet.address.toString({ urlSafe: true, bounceable: false }),
    variant: wallet.variant,
  };
}
