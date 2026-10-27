import { Address, Cell, beginCell, SendMode, type MessageRelaxed } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import {
  TonClient,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
  internal,
} from "@ton/ton";
import { Buffer as BufferPolyfill } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
}

export type SwapCoffeeTxMessage = {
  address: string;
  value: string;
  cell?: string | null;
  payload?: string | null;
  state_init?: string | null;
  stateInit?: string | null;
};

export type SwapCoffeeTonConnectMessage = {
  address: string;
  amount: string;
  payload?: string;
  stateInit?: string;
};

const DEFAULT_SEND_MODE = SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS;
const DEFAULT_RPC = "https://toncenter.com/api/v2/jsonRPC";

/** whatswap maps coffee txs 1:1 into TonConnect `sendTransaction` messages. */
export function mapSwapCoffeeTransactionsToTonConnect(
  transactions: readonly SwapCoffeeTxMessage[],
): SwapCoffeeTonConnectMessage[] {
  return transactions.map((tx) => {
    const payload = (tx.cell ?? tx.payload ?? "").trim();
    const stateInit = (tx.state_init ?? tx.stateInit ?? "").trim();
    return {
      address: tx.address,
      amount: tx.value,
      ...(payload ? { payload } : {}),
      ...(stateInit ? { stateInit } : {}),
    };
  });
}

function parseBocBase64(boc: string): Cell {
  const bytes = BufferPolyfill.from(boc, "base64");
  return Cell.fromBoc(bytes)[0]!;
}

function parseOptionalStateInit(raw: string | null | undefined):
  | { code?: Cell; data?: Cell }
  | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const cell = parseBocBase64(raw.trim());
    const slice = cell.beginParse();
    if (slice.remainingRefs >= 2) {
      return { code: slice.loadRef(), data: slice.loadRef() };
    }
  } catch {
    // Fall through — some SDKs send empty / unused stateInit.
  }
  return undefined;
}

type MatchedWallet = {
  maxMessages: number;
  getSeqno: () => Promise<number>;
  sendMessages: (seqno: number, secretKey: Buffer, messages: MessageRelaxed[]) => Promise<void>;
};

function matchWalletContract(
  client: TonClient,
  publicKey: Buffer,
  expectedFrom: Address | null,
): MatchedWallet | null {
  const workchain = 0;
  const v5 = WalletContractV5R1.create({ workchain, publicKey });
  const v4 = WalletContractV4.create({ workchain, publicKey });
  const v3 = WalletContractV3R2.create({ workchain, publicKey });

  if (expectedFrom?.equals(v5.address)) {
    const opened = client.open(v5);
    return {
      maxMessages: 20,
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
  if (!expectedFrom || expectedFrom.equals(v4.address)) {
    const opened = client.open(v4);
    return {
      maxMessages: 4,
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
  if (expectedFrom.equals(v3.address)) {
    const opened = client.open(v3);
    return {
      maxMessages: 4,
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
 * Sign + broadcast Swap.Coffee `buildTransactionsV2` messages.
 * Built-in HSP wallets are V4; imported wallets match V5 / V4 / V3 to the stored address.
 */
export async function sendSwapCoffeeTransactions(opts: {
  mnemonic: string[];
  transactions: readonly SwapCoffeeTxMessage[];
  endpoint?: string;
  apiKey?: string;
  expectedFromAddress?: string | null;
}): Promise<{ seqno: number }> {
  if (!opts.mnemonic.length) {
    throw new Error("missing_mnemonic");
  }
  if (!opts.transactions.length) {
    throw new Error("no_transactions");
  }

  let expectedFrom: Address | null = null;
  if (opts.expectedFromAddress?.trim()) {
    expectedFrom = Address.parse(opts.expectedFromAddress.trim());
  }

  const keyPair = await mnemonicToPrivateKey(opts.mnemonic);
  const client = new TonClient({
    endpoint: opts.endpoint?.trim() || DEFAULT_RPC,
    apiKey: opts.apiKey,
  });
  const wallet = matchWalletContract(client, keyPair.publicKey, expectedFrom);
  if (!wallet) {
    throw new Error("address_mismatch");
  }
  if (opts.transactions.length > wallet.maxMessages) {
    throw new Error("too_many_messages_for_wallet");
  }

  const seqno = await wallet.getSeqno();
  const messages = opts.transactions.map((tx) => {
    const bodyRaw = (tx.cell ?? tx.payload ?? "").trim();
    const body = bodyRaw ? parseBocBase64(bodyRaw) : beginCell().endCell();
    const init = parseOptionalStateInit(tx.state_init ?? tx.stateInit);
    return internal({
      to: Address.parse(tx.address),
      value: BigInt(tx.value),
      body,
      bounce: true,
      ...(init ? { init } : {}),
    });
  });

  await wallet.sendMessages(seqno, keyPair.secretKey, messages);
  return { seqno };
}
