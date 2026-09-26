export type ChatListSyncStatus = {
  inProgress: boolean;
  cachedCount: number;
  positionedComplete?: boolean;
  /** First TDLib-ordered top page seeded (not live-arrival upserts). */
  stableTopReady?: boolean;
  /** Archive list synced after scroll-up reveal. */
  archiveListReady?: boolean;
  /** Scroll-triggered archive sync running. */
  archiveListInProgress?: boolean;
  tier3Available?: boolean;
  tier3InProgress?: boolean;
};

let currentStatus: ChatListSyncStatus | null = null;
const listeners = new Set<() => void>();

export function setChatListSyncStatus(status: ChatListSyncStatus | null): void {
  currentStatus = status;
  for (const listener of listeners) {
    listener();
  }
}

export function getChatListSyncStatus(): ChatListSyncStatus | null {
  return currentStatus;
}

export function isChatListSyncInProgress(): boolean {
  return currentStatus?.inProgress === true;
}

export function subscribeChatListSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
