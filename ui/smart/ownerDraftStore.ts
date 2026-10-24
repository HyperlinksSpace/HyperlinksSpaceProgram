import { useSyncExternalStore } from "react";

export type OwnerDraftStatus = {
  kind: "ok" | "err";
  message: string;
};

export type OwnerDraft = {
  title: string;
  text: string;
  ownerWallet: string;
  status: OwnerDraftStatus | null;
};

let draft: OwnerDraft = {
  title: "",
  text: "",
  ownerWallet: "",
  status: null,
};

let deployBusy = false;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getOwnerDraft(): OwnerDraft {
  return draft;
}

export function setOwnerDraft(patch: Partial<OwnerDraft>): void {
  const next = { ...draft, ...patch };
  if (
    next.title === draft.title &&
    next.text === draft.text &&
    next.ownerWallet === draft.ownerWallet &&
    next.status === draft.status
  ) {
    return;
  }
  draft = next;
  emit();
}

export function getOwnerDeployBusy(): boolean {
  return deployBusy;
}

export function setOwnerDeployBusy(next: boolean): void {
  if (deployBusy === next) return;
  deployBusy = next;
  emit();
}

export function subscribeOwnerDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOwnerDraft(): OwnerDraft {
  return useSyncExternalStore(subscribeOwnerDraft, getOwnerDraft, getOwnerDraft);
}

export function useOwnerDeployBusy(): boolean {
  return useSyncExternalStore(subscribeOwnerDraft, getOwnerDeployBusy, getOwnerDeployBusy);
}
