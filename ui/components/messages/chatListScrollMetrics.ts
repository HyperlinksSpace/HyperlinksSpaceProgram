/** Scroll metrics for the home left column (chat list lives inside {@link HspScrollColumn}). */
import type { HspScrollAnchor } from "../HspScrollColumn";

export type ChatListScrollMetrics = {
  scrollY: number;
  layoutH: number;
  /** ScrollView content height (includes header chrome + list). */
  contentH: number;
  /** Extra content above chat rows in the same scroller (compact collapsing header + nav). */
  contentTopInsetPx: number;
};

let currentMetrics: ChatListScrollMetrics = {
  scrollY: 0,
  layoutH: 0,
  contentH: 0,
  contentTopInsetPx: 0,
};
const listeners = new Set<() => void>();

type ChatListScrollPreserveHandle = {
  captureScrollAnchor: () => HspScrollAnchor | null;
  restoreScrollPositionOnAppend: (anchor: HspScrollAnchor) => void;
};

let scrollPreserveHandle: ChatListScrollPreserveHandle | null = null;

/** Imperative scroll pin while catalog rows append (same idea as swap ChooseCurrencyTable growth). */
export function registerChatListScrollPreserveHandle(
  handle: ChatListScrollPreserveHandle | null,
): void {
  scrollPreserveHandle = handle;
}

export function captureChatListScrollPreserveAnchor(): HspScrollAnchor | null {
  const anchor = scrollPreserveHandle?.captureScrollAnchor();
  if (!anchor || !Number.isFinite(anchor.scrollTop) || !Number.isFinite(anchor.scrollHeight)) {
    return null;
  }
  return anchor;
}

/** @deprecated Prefer {@link captureChatListScrollPreserveAnchor}. */
export function captureChatListScrollPreserveTop(): number | null {
  return captureChatListScrollPreserveAnchor()?.scrollTop ?? null;
}

export function restoreChatListScrollPreserveAnchor(anchor: HspScrollAnchor): void {
  if (!scrollPreserveHandle) return;
  scrollPreserveHandle.restoreScrollPositionOnAppend(anchor);
}

/** @deprecated Prefer {@link restoreChatListScrollPreserveAnchor}. */
export function restoreChatListScrollPreserveTop(scrollTop: number): void {
  const anchor = captureChatListScrollPreserveAnchor();
  if (anchor) {
    restoreChatListScrollPreserveAnchor({ ...anchor, scrollTop });
    return;
  }
  restoreChatListScrollPreserveAnchor({ scrollTop, scrollHeight: 0 });
}

export function setChatListScrollMetrics(metrics: ChatListScrollMetrics): void {
  if (
    currentMetrics.scrollY === metrics.scrollY &&
    currentMetrics.layoutH === metrics.layoutH &&
    currentMetrics.contentH === (metrics.contentH ?? 0) &&
    currentMetrics.contentTopInsetPx === (metrics.contentTopInsetPx ?? 0)
  ) {
    return;
  }
  currentMetrics = {
    scrollY: metrics.scrollY,
    layoutH: metrics.layoutH,
    contentH: metrics.contentH ?? 0,
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
