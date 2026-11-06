/** Shared scroll/catalog page size for Messages chat list and Swap currency table. */
export const LIST_SCROLL_PAGE_SIZE = 25;

/**
 * Start the next catalog GET when the viewport reaches this many rows before the
 * loaded tail (e.g. page 25 → fire near row 20). Swap / other lists may still use
 * {@link LIST_SCROLL_PREFETCH_LEAD_ROWS}.
 */
export const LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS = 5;

/** Prefetch next catalog page one full slice before the loaded tail (swap / generic). */
export const LIST_SCROLL_PREFETCH_LEAD_ROWS = LIST_SCROLL_PAGE_SIZE;
