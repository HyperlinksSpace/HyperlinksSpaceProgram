import { startTransition, useCallback, useEffect, useState } from "react";

/** Initial rendered chat rows (telegram-tt CHAT_LIST_SLICE). */
export const CHAT_LIST_SLICE = 30;
/** Rows added per near-bottom / auto-reveal expansion. */
export const CHAT_LIST_EXPAND_BY = 25;
/** Delay between automatic top→bottom reveal batches. */
export const CHAT_LIST_AUTO_REVEAL_MS = 32;
/** Gateway first-paint main-list cap — matches INITIAL_MAIN_CHAT_SYNC_LIMIT. */
export const CHAT_LIST_INITIAL_SYNC_LIMIT = 2000;

export type UseChatListViewportOptions = {
  /** When true, grow the reveal window in timed batches until totalCount. Default true. */
  autoReveal?: boolean;
};

export function useChatListViewport(
  totalCount: number,
  options: UseChatListViewportOptions = {},
) {
  const autoReveal = options.autoReveal !== false;
  const [viewportCount, setViewportCount] = useState(() =>
    totalCount > 0 ? Math.min(CHAT_LIST_SLICE, totalCount) : 0,
  );

  useEffect(() => {
    setViewportCount((prev) => {
      if (totalCount <= 0) return 0;
      if (prev <= 0) return Math.min(CHAT_LIST_SLICE, totalCount);
      if (prev > totalCount) return totalCount;
      return prev;
    });
  }, [totalCount]);

  const expandViewport = useCallback(() => {
    startTransition(() => {
      setViewportCount((prev) => Math.min(totalCount, prev + CHAT_LIST_EXPAND_BY));
    });
  }, [totalCount]);

  useEffect(() => {
    if (!autoReveal) return;
    if (totalCount <= 0) return;
    if (viewportCount >= totalCount) return;
    const id = setTimeout(() => {
      startTransition(() => {
        setViewportCount((prev) => Math.min(totalCount, prev + CHAT_LIST_EXPAND_BY));
      });
    }, CHAT_LIST_AUTO_REVEAL_MS);
    return () => clearTimeout(id);
  }, [autoReveal, totalCount, viewportCount]);

  return {
    viewportCount,
    expandViewport,
    canExpandViewport: viewportCount < totalCount,
  };
}
