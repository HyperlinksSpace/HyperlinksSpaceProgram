import { Address, beginCell, storeStateInit, toNano } from "@ton/core";

import { Owner } from "../../owner/wrappers-ts/Owner.gen";
import type { TonConnectTransactionRequest } from "../ton/TonConnectProvider";

const TONCONNECT_MAINNET = "-239";

/** Attached with deploy. Part pays network fees; the remainder stays on the contract. */
export const OWNER_DEPLOY_TON = "5";

export class OwnerDeployInputError extends Error {
  constructor(readonly code: "missing_title" | "missing_wallet" | "invalid_wallet") {
    super(code);
    this.name = "OwnerDeployInputError";
  }
}

export type OwnerDeployTransaction = {
  request: TonConnectTransactionRequest;
  /** Bounceable address of the contract this message deploys. */
  contractAddress: string;
};

/**
 * TonConnect deploy of the Owner contract.
 * State init is the compiled Tolk code plus the form fields (controller, title, text).
 */
export function buildOwnerDeployTransaction(opts: {
  title: string;
  text: string;
  ownerWallet: string;
}): OwnerDeployTransaction {
  const title = opts.title.trim();
  const text = opts.text ?? "";
  const ownerWallet = opts.ownerWallet.trim();
  if (!title) throw new OwnerDeployInputError("missing_title");
  if (!ownerWallet) throw new OwnerDeployInputError("missing_wallet");

  let owner: Address;
  try {
    owner = Address.parse(ownerWallet);
  } catch {
    throw new OwnerDeployInputError("invalid_wallet");
  }

  const contract = Owner.fromStorage({ owner, title, text });
  if (!contract.init) {
    throw new Error("missing_state_init");
  }

  const stateInit = beginCell()
    .store(
      storeStateInit({
        code: contract.init.code,
        data: contract.init.data,
      }),
    )
    .endCell()
    .toBoc()
    .toString("base64");

  return {
    contractAddress: contract.address.toString({ urlSafe: true, bounceable: true }),
    request: {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      network: TONCONNECT_MAINNET,
      messages: [
        {
          address: contract.address.toString({ urlSafe: true, bounceable: false }),
          amount: toNano(OWNER_DEPLOY_TON).toString(),
          stateInit,
        },
      ],
    },
  };
}
