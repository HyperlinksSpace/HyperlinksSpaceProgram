/** Scroll metrics for the home left column (chat list lives inside {@link HspScrollColumn}). */
export type ChatListScrollMetrics = {
  scrollY: number;
  layoutH: number;
  /** Extra content above chat rows in the same scroller (compact collapsing header + nav). */
  contentTopInsetPx: number;
};

let currentMetrics: ChatListScrollMetrics = { scrollY: 0, layoutH: 0, contentTopInsetPx: 0 };
const listeners = new Set<() => void>();

export function setChatListScrollMetrics(metrics: ChatListScrollMetrics): void {
  if (
    currentMetrics.scrollY === metrics.scrollY &&
    currentMetrics.layoutH === metrics.layoutH &&
    currentMetrics.contentTopInsetPx === (metrics.contentTopInsetPx ?? 0)
  ) {
    return;
  }
  currentMetrics = {
    scrollY: metrics.scrollY,
    layoutH: metrics.layoutH,
    contentTopInsetPx: metrics.contentTopInsetPx ?? 0,
  };
  for (const listener of listeners) {
    listener();
  }
}

export function getChatListScrollMetrics(): ChatListScrollMetrics {
  return currentMetrics;
}

export function subscribeChatListScrollMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
