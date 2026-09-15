import { useSyncExternalStore } from "react";

import {
  SWAP_DLLR_TOKEN,
  type SwapPairToken,
} from "../swap/swapPairTypes";

export type SendSourceKind = "builtin" | "tonconnect";

export type SendFormState = {
  address: string;
  comment: string;
  amount: string;
  token: SwapPairToken;
  balanceText: string;
  priceUsd: number | null;
  sourceKind: SendSourceKind;
  balancesLoading: boolean;
  sending: boolean;
};

let state: SendFormState = {
  address: "",
  comment: "",
  amount: "1",
  token: SWAP_DLLR_TOKEN,
  balanceText: "0",
  priceUsd: 1,
  sourceKind: "builtin",
  balancesLoading: false,
  sending: false,
};

let sendAction: (() => void) | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setSendFormAddress(address: string) {
  if (state.address === address) return;
  state = { ...state, address };
  emit();
}

export function setSendFormComment(comment: string) {
  if (state.comment === comment) return;
  state = { ...state, comment };
  emit();
}

export function setSendFormAmount(amount: string) {
  if (state.amount === amount) return;
  state = { ...state, amount };
  emit();
}

export function setSendFormState(patch: Partial<SendFormState>) {
  const next: SendFormState = {
    address: patch.address ?? state.address,
    comment: patch.comment ?? state.comment,
    amount: patch.amount ?? state.amount,
    token: patch.token ?? state.token,
    balanceText: patch.balanceText ?? state.balanceText,
    priceUsd: patch.priceUsd !== undefined ? patch.priceUsd : state.priceUsd,
    sourceKind: patch.sourceKind ?? state.sourceKind,
    balancesLoading: patch.balancesLoading ?? state.balancesLoading,
    sending: patch.sending ?? state.sending,
  };
  if (
    next.address === state.address &&
    next.comment === state.comment &&
    next.amount === state.amount &&
    next.token === state.token &&
    next.balanceText === state.balanceText &&
    next.priceUsd === state.priceUsd &&
    next.sourceKind === state.sourceKind &&
    next.balancesLoading === state.balancesLoading &&
    next.sending === state.sending
  ) {
    return;
  }
  state = next;
  emit();
}

export function registerSendFormAction(action: (() => void) | null) {
  sendAction = action;
}

export function runSendFormAction() {
  sendAction?.();
}

export function getSendFormState(): SendFormState {
  return state;
}

export function subscribeSendForm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSendFormState(): SendFormState {
  return useSyncExternalStore(subscribeSendForm, getSendFormState, getSendFormState);
}
