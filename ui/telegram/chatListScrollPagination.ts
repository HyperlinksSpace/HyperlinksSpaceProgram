import { CHAT_LIST_API_PAGE_SIZE } from "../hooks/useChatListViewport";

/** Next 1-based API page to fetch on scroll (page 1 → offset 0). */
let nextPage = 1;
/** More scroll-sized pages available from GET /chats. */
let hasMore = true;
/** Highest page index successfully applied (1-based). */
let loadedPages = 0;
let scrollFetchInFlight = false;
/** Rows confirmed from the live server slice (offset + page length), not fixed 25-row pages. */
let catalogLoadedRowCount = 0;
let generation = 0;
/**
 * First GET at offset 0 establishes page 1. Silent polls repeat offset 0 with new
 * revision data — they must not call {@link noteChatListPageLoaded} as extra pages
 * or scroll loads will keep requesting offset 25 while the cursor thinks page 2
 * is already done.
 */
let offset0CatalogPageCommitted = false;

const MAX_RANKING_REFRESH_PAGES = 8;

export function resetChatListScrollPagination(): void {
  generation += 1;
  nextPage = 1;
  hasMore = true;
  loadedPages = 0;
  scrollFetchInFlight = false;
  offset0CatalogPageCommitted = false;
  catalogLoadedRowCount = 0;
}

export function chatListScrollPaginationGeneration(): number {
  return generation;
}

export function getChatListLoadedPages(): number {
  return loadedPages;
}

/** Confirmed rows from the server slice cursor (not fixed 25-row page math). */
export function getCatalogLoadedRowCount(): number {
  return catalogLoadedRowCount;
}

export function chatListScrollHasMore(): boolean {
  return hasMore;
}

export function resolveChatListFetchOffset(options?: {
  fromScroll?: boolean;
  pageOffset?: number;
}): number {
  if (options?.fromScroll === true) {
    return takeChatListScrollFetchOffset();
  }
  return Math.max(0, options?.pageOffset ?? 0);
}

/**
 * Reserve the next scroll page offset and advance the cursor immediately so
 * queued scroll loads continue after the last confirmed row (16 → 16, not 25).
 */
export function takeChatListScrollFetchOffset(): number {
  if (loadedPages >= 1 && nextPage <= loadedPages) {
    nextPage = loadedPages + 1;
  }
  const pageToFetch = nextPage;
  nextPage = pageToFetch + 1;
  const offset = Math.max(0, catalogLoadedRowCount);
  if (loadedPages >= 1 && offset <= 0) {
    return Math.max(0, (loadedPages - 1) * CHAT_LIST_API_PAGE_SIZE);
  }
  return offset;
}

/** Undo {@link takeChatListScrollFetchOffset} when the scroll fetch did not succeed. */
export function rollbackChatListScrollFetchReservation(): void {
  if (nextPage > loadedPages + 1) {
    nextPage -= 1;
  }
}

/** Keep next-page cursor aligned — never infer loaded pages from row count (poll merges). */
export function repairChatListPaginationFromClient(
  loadedChatCount: number,
  totalCount: number,
): void {
  if (loadedChatCount <= 0) return;
  if (loadedPages <= 0) {
    loadedPages = 1;
    nextPage = 2;
  }
  catalogLoadedRowCount = Math.max(catalogLoadedRowCount, loadedChatCount);
  if (loadedPages >= 1 && nextPage <= loadedPages) {
    nextPage = loadedPages + 1;
  }
  const loadedThrough = Math.max(
    catalogLoadedRowCount,
    loadedPages * CHAT_LIST_API_PAGE_SIZE,
    loadedChatCount,
  );
  hasMore =
    totalCount > 0
      ? loadedThrough < totalCount
      : loadedChatCount >= CHAT_LIST_API_PAGE_SIZE;
}

/** True while scroll catalog still has unfetched pages (jettons-style paging). */
export function chatListScrollCatalogPartial(
  loadedChatCount: number,
  totalCount: number,
): boolean {
  if (totalCount <= 0) return hasMore && loadedPages >= 1;
  const loadedThrough = Math.max(
    catalogLoadedRowCount,
    loadedPages * CHAT_LIST_API_PAGE_SIZE,
    loadedChatCount,
  );
  return loadedPages >= 1 && hasMore && loadedChatCount < totalCount && loadedThrough < totalCount;
}

export function chatListPaginationFullyLoaded(
  loadedChatCount: number,
  totalCount: number,
): boolean {
  if (totalCount <= 0) return !hasMore;
  const loadedThrough = Math.max(
    catalogLoadedRowCount,
    loadedChatCount,
    getChatListLoadedPages() * CHAT_LIST_API_PAGE_SIZE,
  );
  return loadedThrough >= totalCount;
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
    } else if (totalCount > 0 && pageOffset >= totalCount) {
      hasMore = false;
    }
    return;
  }
  // Ignore duplicate offset-0 catalog responses (metronome / SSE flush / poll).
  if (pageOffset === 0 && offset0CatalogPageCommitted) {
    if (totalCount > 0 && loadedPages >= 1) {
      hasMore = catalogLoadedRowCount < totalCount;
    }
    return;
  }
  if (pageOffset === 0) {
    offset0CatalogPageCommitted = true;
  }
  const pageIndex = Math.floor(pageOffset / CHAT_LIST_API_PAGE_SIZE) + 1;
  loadedPages = Math.max(loadedPages, pageIndex);
  nextPage = Math.max(nextPage, loadedPages + 1);
  const loadedThrough = pageOffset + rowCount;
  catalogLoadedRowCount = Math.max(catalogLoadedRowCount, loadedThrough);
  hasMore =
    totalCount <= 0
      ? rowCount >= CHAT_LIST_API_PAGE_SIZE
      : loadedThrough < totalCount;
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
  catalogLoadedRowCount = Math.max(catalogLoadedRowCount, rowCount);
  hasMore = totalCount > 0 ? rowCount < totalCount : rowCount >= CHAT_LIST_API_PAGE_SIZE;
}

export function rankingRefreshPageCount(): number {
  return Math.min(Math.max(loadedPages, nextPage - 1), MAX_RANKING_REFRESH_PAGES);
}

export function rankingRefreshOffsetForPage(pageIndex: number): number {
  return Math.max(0, (pageIndex - 1) * CHAT_LIST_API_PAGE_SIZE);
}
