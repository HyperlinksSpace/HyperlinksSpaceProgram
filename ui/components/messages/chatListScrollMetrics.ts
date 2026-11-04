/** Scroll metrics for the home left column (chat list lives inside {@link HspScrollColumn}). */
export type ChatListScrollMetrics = {
  scrollY: number;
  layoutH: number;
  /** Extra content above chat rows in the same scroller (compact collapsing header + nav). */
  contentTopInsetPx: number;
};

let currentMetrics: ChatListScrollMetrics = { scrollY: 0, layoutH: 0, contentTopInsetPx: 0 };
const listeners = new Set<() => void>();

type ChatListScrollPreserveHandle = {
  captureScrollTop: () => number | null;
  restoreScrollTop: (scrollTop: number) => void;
};

let scrollPreserveHandle: ChatListScrollPreserveHandle | null = null;

/** Imperative scroll pin while catalog rows append (same idea as Swap list growth). */
export function registerChatListScrollPreserveHandle(
  handle: ChatListScrollPreserveHandle | null,
): void {
  scrollPreserveHandle = handle;
}

export function captureChatListScrollPreserveTop(): number | null {
  const top = scrollPreserveHandle?.captureScrollTop();
  return typeof top === "number" && Number.isFinite(top) ? top : null;
}

export function restoreChatListScrollPreserveTop(scrollTop: number): void {
  if (!scrollPreserveHandle) return;
  const run = () => scrollPreserveHandle?.restoreScrollTop(scrollTop);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    queueMicrotask(run);
  }
}

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
