import { useSyncExternalStore } from "react";

/**
 * Which wallet the user last chose in the header “Choose wallet” menu.
 * Drives header address snippet + radio selection; TonConnect session is
 * reconciled to match (disconnect for built-in, connect for external).
 */
export type ActiveWalletPreference =
  | { source: "builtin" }
  | {
      source: "tonconnect";
      /** Chosen / last connected address; empty while the connect modal is pending. */
      address: string;
    }
  | {
      source: "imported";
      address: string;
    };

const STORAGE_KEY = "hsp.activeWalletPreference.v1";

let state: ActiveWalletPreference = { source: "builtin" };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (!canUseStorage()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ActiveWalletPreference> | null;
    if (!parsed || typeof parsed !== "object") return;
    if (parsed.source === "builtin") {
      state = { source: "builtin" };
      return;
    }
    if (parsed.source === "tonconnect") {
      const address = typeof parsed.address === "string" ? parsed.address.trim() : "";
      state = { source: "tonconnect", address };
      return;
    }
    if (parsed.source === "imported") {
      const address = typeof parsed.address === "string" ? parsed.address.trim() : "";
      if (address) state = { source: "imported", address };
    }
  } catch {
    /* ignore */
  }
}

function persist(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function sameWalletAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

export function getActiveWalletPreference(): ActiveWalletPreference {
  hydrate();
  return state;
}

export function subscribeActiveWalletPreference(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function preferBuiltinWallet(): void {
  hydrate();
  if (state.source === "builtin") return;
  state = { source: "builtin" };
  persist();
  emit();
}

export function preferTonConnectWallet(address: string): void {
  hydrate();
  const trimmed = address.trim();
  if (state.source === "tonconnect" && sameWalletAddress(state.address, trimmed)) {
    return;
  }
  state = { source: "tonconnect", address: trimmed };
  persist();
  emit();
}

/** Mark TonConnect as intended before the connect modal resolves an address. */
export function preferTonConnectPending(): void {
  hydrate();
  if (state.source === "tonconnect") return;
  state = { source: "tonconnect", address: "" };
  persist();
  emit();
}

export function preferImportedWallet(address: string): void {
  hydrate();
  const trimmed = address.trim();
  if (!trimmed) return;
  if (state.source === "imported" && sameWalletAddress(state.address, trimmed)) {
    return;
  }
  state = { source: "imported", address: trimmed };
  persist();
  emit();
}

export function useActiveWalletPreference(): ActiveWalletPreference {
  return useSyncExternalStore(
    subscribeActiveWalletPreference,
    getActiveWalletPreference,
    getActiveWalletPreference,
  );
}

/** Address shown in the header / used as the “chosen” wallet for UI. */
export function resolveActiveWalletAddress(opts: {
  builtinAddress: string;
  preference: ActiveWalletPreference;
  tonConnected: boolean;
  tonAddress: string | null | undefined;
}): string {
  const builtin = opts.builtinAddress.trim();
  if (opts.preference.source === "imported") {
    const preferred = opts.preference.address.trim();
    if (preferred) return preferred;
    return builtin;
  }
  if (opts.preference.source === "tonconnect") {
    const preferred = opts.preference.address.trim();
    // Prefer the explicitly chosen address so picking a remembered TonConnect
    // wallet does not require reopening the connect modal.
    if (preferred) return preferred;
    if (opts.tonConnected) {
      const live = (opts.tonAddress ?? "").trim();
      if (live) return live;
    }
  }
  return builtin;
}

export function isActiveWalletSelection(opts: {
  preference: ActiveWalletPreference;
  rowBuiltin: boolean;
  rowImported?: boolean;
  rowAddress: string;
}): boolean {
  if (opts.rowBuiltin) {
    return opts.preference.source === "builtin";
  }
  if (opts.rowImported) {
    if (opts.preference.source !== "imported") return false;
    const preferred = opts.preference.address.trim();
    if (!preferred) return false;
    return sameWalletAddress(preferred, opts.rowAddress);
  }
  if (opts.preference.source !== "tonconnect") return false;
  const preferred = opts.preference.address.trim();
  if (!preferred) return false;
  return sameWalletAddress(preferred, opts.rowAddress);
}
