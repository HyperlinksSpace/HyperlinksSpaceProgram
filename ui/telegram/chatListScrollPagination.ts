import { CHAT_LIST_API_PAGE_SIZE } from "../hooks/useChatListViewport";

/** Next 1-based API page to fetch on scroll (page 1 → offset 0). */
let nextPage = 1;
/** More scroll-sized pages available from GET /chats. */
let hasMore = true;
/** Highest page index successfully applied (1-based). */
let loadedPages = 0;
let scrollFetchInFlight = false;
let generation = 0;

const MAX_RANKING_REFRESH_PAGES = 8;

export function resetChatListScrollPagination(): void {
  generation += 1;
  nextPage = 1;
  hasMore = true;
  loadedPages = 0;
  scrollFetchInFlight = false;
}

export function chatListScrollPaginationGeneration(): number {
  return generation;
}

export function getChatListLoadedPages(): number {
  return loadedPages;
}

export function chatListScrollHasMore(): boolean {
  return hasMore;
}

export function resolveChatListFetchOffset(options?: {
  fromScroll?: boolean;
  pageOffset?: number;
}): number {
  if (options?.fromScroll === true) {
    if (loadedPages >= 1 && nextPage <= 1) {
      nextPage = loadedPages + 1;
    }
    let offset = Math.max(0, (nextPage - 1) * CHAT_LIST_API_PAGE_SIZE);
    if (offset === 0 && loadedPages >= 1) {
      nextPage = loadedPages + 1;
      offset = loadedPages * CHAT_LIST_API_PAGE_SIZE;
    }
    return offset;
  }
  return Math.max(0, options?.pageOffset ?? 0);
}

/** Keep page indices aligned when the React list grew via merge/gateway sync. */
export function repairChatListPaginationFromClient(
  loadedChatCount: number,
  totalCount: number,
): void {
  if (loadedChatCount <= 0) return;
  const pagesFromRows = Math.max(1, Math.ceil(loadedChatCount / CHAT_LIST_API_PAGE_SIZE));
  if (pagesFromRows > loadedPages) {
    loadedPages = pagesFromRows;
    nextPage = Math.max(nextPage, loadedPages + 1);
  }
  const loadedThrough = loadedPages * CHAT_LIST_API_PAGE_SIZE;
  hasMore =
    totalCount > 0
      ? loadedThrough < totalCount
      : loadedChatCount >= CHAT_LIST_API_PAGE_SIZE;
}

export function chatListPaginationFullyLoaded(
  loadedChatCount: number,
  totalCount: number,
): boolean {
  if (totalCount <= 0) return !hasMore;
  return (
    loadedChatCount >= totalCount ||
    getChatListLoadedPages() * CHAT_LIST_API_PAGE_SIZE >= totalCount
  );
}

export function beginChatListScrollPageFetch(): boolean {
  if (!hasMore || scrollFetchInFlight) return false;
  scrollFetchInFlight = true;
  return true;
}

export function endChatListScrollPageFetch(): void {
  scrollFetchInFlight = false;
}

export function isChatListScrollPageFetchInFlight(): boolean {
  return scrollFetchInFlight;
}

/**
 * Update scroll pagination after a paged GET succeeded.
 * Uses API page boundaries — not React row count (merge/rank can change length).
 */
export function noteChatListPageLoaded(
  pageOffset: number,
  rowCount: number,
  totalCount: number,
): void {
  if (rowCount <= 0) {
    if (pageOffset === 0) {
      hasMore = false;
    }
    return;
  }
  const pageIndex = Math.floor(pageOffset / CHAT_LIST_API_PAGE_SIZE) + 1;
  loadedPages = Math.max(loadedPages, pageIndex);
  if (pageIndex >= nextPage - 1) {
    nextPage = pageIndex + 1;
  }
  const loadedThrough = pageOffset + rowCount;
  hasMore =
    rowCount >= CHAT_LIST_API_PAGE_SIZE &&
    (totalCount <= 0 || loadedThrough < totalCount);
}

export function syncChatListPaginationAfterFullLoad(
  rowCount: number,
  totalCount: number,
): void {
  if (rowCount <= 0) {
    loadedPages = 0;
    nextPage = 1;
    hasMore = false;
    return;
  }
  loadedPages = Math.max(1, Math.ceil(rowCount / CHAT_LIST_API_PAGE_SIZE));
  nextPage = loadedPages + 1;
  hasMore = totalCount > 0 ? rowCount < totalCount : rowCount >= CHAT_LIST_API_PAGE_SIZE;
}

export function rankingRefreshPageCount(): number {
  return Math.min(Math.max(loadedPages, nextPage - 1), MAX_RANKING_REFRESH_PAGES);
}

export function rankingRefreshOffsetForPage(pageIndex: number): number {
  return Math.max(0, (pageIndex - 1) * CHAT_LIST_API_PAGE_SIZE);
}
