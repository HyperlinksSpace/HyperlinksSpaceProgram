import { Address, beginCell, toNano, TonClient, WalletContractV4, internal } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { Buffer as BufferPolyfill } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
}

const JETTON_TRANSFER_OP = 0x0f8a7ea5;

export type SendBuiltInTransferParams = {
  mnemonic: string[];
  /** Destination owner (friendly or raw). */
  toAddress: string;
  /** Decimal amount string (e.g. "1.5"). */
  amount: string;
  /** Token decimals (9 for native TON). */
  decimals: number;
  /** When set, send this jetton master; otherwise native TON. */
  jettonMasterAddress?: string | null;
  comment?: string;
  expectedFromAddress?: string | null;
};

export type SendBuiltInTransferResult =
  | { ok: true; seqno: number; fromAddress: string }
  | { ok: false; error: string };

function getTonRpcClient(): TonClient {
  const endpoint =
    process.env.TONCENTER_RPC_URL?.trim() ||
    process.env.TON_RPC_URL?.trim() ||
    "https://toncenter.com/api/v2/jsonRPC";
  const apiKey =
    process.env.TONCENTER_API_KEY?.trim() ||
    process.env.TONCENTER_MAINNET_API_KEY?.trim() ||
    undefined;
  return new TonClient({ endpoint, apiKey });
}

function parseTokenAmountToUnits(raw: string, decimals: number): bigint | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/\s/g, "");
  if (!cleaned || !/^\d*\.?\d+$/.test(cleaned)) return null;
  const [wholePart, fracPart = ""] = cleaned.split(".");
  if (fracPart.length > decimals) return null;
  const frac = fracPart.padEnd(decimals, "0");
  const digits = `${wholePart || "0"}${frac}`.replace(/^0+/, "") || "0";
  try {
    const value = BigInt(digits);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
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

async function resolveJettonWalletAddress(
  client: TonClient,
  jettonMaster: string,
  ownerAddress: Address,
): Promise<Address> {
  const minter = Address.parse(jettonMaster);
  const result = await client.runMethod(minter, "get_wallet_address", [
    { type: "slice", cell: beginCell().storeAddress(ownerAddress).endCell() },
  ]);
  return result.stack.readAddress();
}

/**
 * Sign + broadcast a native TON or jetton transfer from the built-in Wallet V4
 * ([@ton/ton](https://github.com/ton-org/ton)).
 */
export async function sendBuiltInTransfer(
  opts: SendBuiltInTransferParams,
): Promise<SendBuiltInTransferResult> {
  if (!opts.mnemonic.length) {
    return { ok: false, error: "missing_mnemonic" };
  }

  const units = parseTokenAmountToUnits(opts.amount, opts.decimals);
  if (units == null) {
    return { ok: false, error: "invalid_amount" };
  }

  let toAddr: Address;
  try {
    toAddr = Address.parse(opts.toAddress.trim());
  } catch {
    return { ok: false, error: "invalid_to_address" };
  }

  const keyPair = await mnemonicToPrivateKey(opts.mnemonic);
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });

  if (opts.expectedFromAddress?.trim()) {
    try {
      const expected = Address.parse(opts.expectedFromAddress.trim());
      if (!expected.equals(wallet.address)) {
        return { ok: false, error: "address_mismatch" };
      }
    } catch {
      return { ok: false, error: "invalid_expected_address" };
    }
  }

  const client = getTonRpcClient();
  const contract = client.open(wallet);
  const seqno = await contract.getSeqno();
  const comment = opts.comment?.trim() ?? "";
  const jettonMaster = opts.jettonMasterAddress?.trim() ?? "";

  if (!jettonMaster) {
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: toAddr,
          value: units,
          bounce: false,
          body: comment ? buildTextCommentCell(comment) : undefined,
        }),
      ],
    });
  } else {
    const senderJettonWallet = await resolveJettonWalletAddress(
      client,
      jettonMaster,
      wallet.address,
    );
    const body = buildJettonTransferBody({
      toOwner: toAddr,
      amount: units,
      responseOwner: wallet.address,
      comment: comment || undefined,
    });
    await contract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: senderJettonWallet,
          value: toNano("0.08"),
          bounce: true,
          body,
        }),
      ],
    });
  }

  return {
    ok: true,
    seqno,
    fromAddress: wallet.address.toString({ urlSafe: true, bounceable: false }),
  };
}
