import { useSyncExternalStore } from "react";

export type SwapCurrencySide = "buy" | "sell";

let activeSide: SwapCurrencySide | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function openSwapCurrencyPicker(side: SwapCurrencySide) {
  if (activeSide === side) return;
  activeSide = side;
  emit();
}

export function closeSwapCurrencyPicker() {
  if (activeSide === null) return;
  activeSide = null;
  emit();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return activeSide;
}

function getServerSnapshot() {
  return null as SwapCurrencySide | null;
}

export function useSwapCurrencyPicker(): SwapCurrencySide | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
