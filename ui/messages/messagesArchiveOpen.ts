import { useSyncExternalStore } from "react";

let archiveOpen = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getMessagesArchiveOpen(): boolean {
  return archiveOpen;
}

export function setMessagesArchiveOpen(next: boolean): void {
  if (archiveOpen === next) return;
  archiveOpen = next;
  emit();
}

export function subscribeMessagesArchiveOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMessagesArchiveOpen(): boolean {
  return useSyncExternalStore(subscribeMessagesArchiveOpen, getMessagesArchiveOpen, () => false);
}
