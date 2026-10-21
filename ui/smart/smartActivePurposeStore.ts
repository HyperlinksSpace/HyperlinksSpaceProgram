import { useSyncExternalStore } from "react";

import { SMART_PURPOSE_DEFAULT, type SmartPurposeKey } from "./smartPurposeTypes";

let activePurpose: SmartPurposeKey = SMART_PURPOSE_DEFAULT;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getSmartActivePurpose(): SmartPurposeKey {
  return activePurpose;
}

export function setSmartActivePurpose(next: SmartPurposeKey): void {
  if (activePurpose === next) return;
  activePurpose = next;
  emit();
}

export function subscribeSmartActivePurpose(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSmartActivePurpose(): SmartPurposeKey {
  return useSyncExternalStore(subscribeSmartActivePurpose, getSmartActivePurpose, getSmartActivePurpose);
}
