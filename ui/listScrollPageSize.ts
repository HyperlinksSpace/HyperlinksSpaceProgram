/** Shared scroll/catalog page size for Messages chat list and Swap currency table. */
export const LIST_SCROLL_PAGE_SIZE = 25;

/** Prefetch next page when this many rows from the loaded tail (Swap table uses ~35% of viewport). */
export const LIST_SCROLL_PREFETCH_LEAD_ROWS = Math.max(
  8,
  Math.ceil(LIST_SCROLL_PAGE_SIZE * 0.35),
);
