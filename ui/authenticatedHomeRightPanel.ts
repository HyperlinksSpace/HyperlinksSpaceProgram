import { useSyncExternalStore } from "react";

/** Right split column content on authenticated home (wide layout only). */
export type AuthenticatedHomeRightPanelKey = "swap" | "smarts" | "trade" | "send" | "get";

let activePanel: AuthenticatedHomeRightPanelKey | null = null;
let storeVersion = 0;
const listeners = new Set<() => void>();

function emit() {
  storeVersion += 1;
  for (const l of listeners) {
    l();
  }
}

export function openAuthenticatedHomeRightPanel(key: AuthenticatedHomeRightPanelKey) {
  if (activePanel === key) {
    return;
  }
  activePanel = key;
  emit();
}

export function closeAuthenticatedHomeRightPanel() {
  if (activePanel === null) {
    return;
  }
  activePanel = null;
  emit();
}

function getSnapshot() {
  return activePanel;
}

function getServerSnapshot() {
  return null as AuthenticatedHomeRightPanelKey | null;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useAuthenticatedHomeRightPanel(): AuthenticatedHomeRightPanelKey | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
