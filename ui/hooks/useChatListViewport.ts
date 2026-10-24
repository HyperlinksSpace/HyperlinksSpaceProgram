import { startTransition, useCallback, useEffect, useState } from "react";

/**
 * Virtualization already mounts only the visible band (telegram-tt / Desktop).
 * Do not drip-feed the data window — that makes a cached 200+ list feel lazy
 * and resets to 30 rows after search.
 */
export const CHAT_LIST_SLICE = 2000;
/** Rows added per near-bottom expansion when the window is still capped. */
export const CHAT_LIST_EXPAND_BY = 2000;
/** Unused: reveal is immediate. Kept so existing imports keep compiling. */
export const CHAT_LIST_AUTO_REVEAL_MS = 0;
/** Gateway first-paint main-list cap — matches INITIAL_MAIN_CHAT_SYNC_LIMIT. */
export const CHAT_LIST_INITIAL_SYNC_LIMIT = 2000;

export type UseChatListViewportOptions = {
  /** When true, grow the reveal window until totalCount. Default true. */
  autoReveal?: boolean;
};

export function useChatListViewport(
  totalCount: number,
  options: UseChatListViewportOptions = {},
) {
  const autoReveal = options.autoReveal !== false;
  const [viewportCount, setViewportCount] = useState(() =>
    totalCount > 0 ? totalCount : 0,
  );

  useEffect(() => {
    setViewportCount((prev) => {
      if (totalCount <= 0) return 0;
      // Never shrink a painted window back to a tiny first slice (search exit).
      if (prev > totalCount) return totalCount;
      if (autoReveal) return totalCount;
      if (prev <= 0) return totalCount;
      return prev;
    });
  }, [autoReveal, totalCount]);

  const expandViewport = useCallback(() => {
    startTransition(() => {
      setViewportCount((prev) => Math.min(totalCount, Math.max(prev, totalCount)));
    });
  }, [totalCount]);

  return {
    viewportCount,
    expandViewport,
    canExpandViewport: viewportCount < totalCount,
  };
}
