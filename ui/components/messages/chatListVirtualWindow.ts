import {
  LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS,
  LIST_SCROLL_PAGE_SIZE,
  LIST_SCROLL_PREFETCH_LEAD_ROWS,
} from "../../listScrollPageSize";
import type { MessageChatRowData } from "./MessageChatRow";
import { MESSAGE_ROW_HEIGHT_PX } from "./messageListLayout";

/** Extra pixels rendered above/below the chat-list viewport. */
export const CHAT_LIST_VIRTUAL_OVERSCAN_PX = 600;
/** Max tier-3 rows kept in client memory. */
export const CHAT_LIST_TIER3_CLIENT_CAP = 80;
/** Minimum chats before windowing kicks in. */
export const CHAT_LIST_VIRTUALIZE_MIN_ROWS = 20;

export type ChatListVirtualWindow = {
  enabled: boolean;
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
};

export type ChatListTier = "pinned" | "positioned" | "unpositioned";

/** Compare TDLib chat `order` strings (64-bit integers) descending — Telegram Desktop order. */
function compareTdlibOrderDesc(a: string, b: string): number {
  const left = a && a.trim() ? a.trim() : "0";
  const right = b && b.trim() ? b.trim() : "0";
  if (left === right) return 0;
  try {
    const bi = BigInt(left);
    const bj = BigInt(right);
    if (bi === bj) return 0;
    return bi > bj ? -1 : 1;
  } catch {
    if (left.length !== right.length) return right.length - left.length;
    return right.localeCompare(left);
  }
}

function comparePinOrderDesc(a: string, b: string): number {
  return compareTdlibOrderDesc(a, b);
}

function tierRank(tier: ChatListTier | null | undefined): number {
  if (tier === "pinned") return 0;
  if (tier === "positioned") return 1;
  if (tier === "unpositioned") return 2;
  return 1;
}

export function resolveChatListTier(row: MessageChatRowData): ChatListTier {
  if (row.list_tier === "pinned" || row.list_tier === "positioned" || row.list_tier === "unpositioned") {
    return row.list_tier;
  }
  return row.is_pinned ? "pinned" : "positioned";
}

export function sortChatRowsTierAware(rows: MessageChatRowData[]): MessageChatRowData[] {
  return [...rows].sort((a, b) => {
    const aTier = resolveChatListTier(a);
    const bTier = resolveChatListTier(b);
    const tierDiff = tierRank(aTier) - tierRank(bTier);
    if (tierDiff !== 0) return tierDiff;
    // Pinned + positioned: TDLib main-list order (same as Telegram Desktop / WebK).
    if (aTier === "pinned" || aTier === "positioned") {
      const byOrder = compareTdlibOrderDesc(a.pin_order ?? "0", b.pin_order ?? "0");
      if (byOrder !== 0) return byOrder;
    }
    const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    if (tb !== ta) return tb - ta;
    return b.telegram_chat_id - a.telegram_chat_id;
  });
}

export function isChatListVirtualizationActive(count: number): boolean {
  return count >= CHAT_LIST_VIRTUALIZE_MIN_ROWS;
}

/**
 * TDLib `loadChats` / Desktop `preloadRowsData`: prefetch when the viewport bottom
 * approaches the catalog tail in scroll space (not only when a DOM sentinel intersects).
 */
/** Extra virtual rows below the loaded tail so prefetch fires before the last chat row. */
export function chatListCatalogPhantomRowCount(
  loadedChatCount: number,
  serverTotalCount: number,
): number {
  if (serverTotalCount <= 0 || loadedChatCount >= serverTotalCount) return 0;
  const remaining = serverTotalCount - loadedChatCount;
  const lead = Math.max(LIST_SCROLL_PREFETCH_LEAD_ROWS, LIST_SCROLL_PAGE_SIZE);
  return Math.min(remaining, lead);
}

/**
 * True when the user has scrolled to within `tailLeadRows` of the bottom of the
 * **loaded** chat rows (not the phantom tail). That matches "start the next GET
 * when row ~20 is visible" for a 25-row page.
 */
export function chatListCatalogTailWithinPrefetch(
  totalRowCount: number,
  loadedChatRowCount: number,
  metrics: { scrollY: number; layoutH: number },
  options: ChatListVirtualWindowOptions & {
    tailLeadRows?: number;
    /** @deprecated Use tailLeadRows; px override if callers need custom slack. */
    prefetchPx?: number;
  } = {},
): boolean {
  if (totalRowCount <= 0 || metrics.layoutH <= 0) return false;
  if (loadedChatRowCount <= 0) return false;
  const rowStridePx = options.rowStridePx ?? MESSAGE_ROW_HEIGHT_PX;
  const contentTopInsetPx = options.contentTopInsetPx ?? 0;
  const tailLeadRows =
    typeof options.tailLeadRows === "number" && Number.isFinite(options.tailLeadRows)
      ? Math.max(0, options.tailLeadRows)
      : LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS;
  const prefetchPx =
    typeof options.prefetchPx === "number" && Number.isFinite(options.prefetchPx)
      ? options.prefetchPx
      : tailLeadRows * rowStridePx;
  const totalHeight = contentTopInsetPx + totalRowCount * rowStridePx;
  const maxScrollY = Math.max(0, totalHeight - metrics.layoutH);
  const scrollY = Math.min(Math.max(0, metrics.scrollY), maxScrollY);
  const viewportBottom = scrollY + metrics.layoutH;
  const loadedTailY = contentTopInsetPx + loadedChatRowCount * rowStridePx;
  return viewportBottom >= loadedTailY - prefetchPx;
}

export type ChatListVirtualWindowOptions = {
  rowStridePx?: number;
  overscanPx?: number;
  contentTopInsetPx?: number;
  /** Keep window indices stable until scroll crosses the next row boundary. */
  stickyWindow?: Pick<ChatListVirtualWindow, "startIndex" | "endIndex">;
};

export function resolveChatListVirtualWindow(
  totalCount: number,
  metrics: { scrollY: number; layoutH: number },
  options: ChatListVirtualWindowOptions = {},
): ChatListVirtualWindow {
  const rowStridePx = options.rowStridePx ?? MESSAGE_ROW_HEIGHT_PX;
  const overscanPx = options.overscanPx ?? CHAT_LIST_VIRTUAL_OVERSCAN_PX;
  const contentTopInsetPx = options.contentTopInsetPx ?? 0;
  const disabledWindow: ChatListVirtualWindow = {
    enabled: false,
    startIndex: 0,
    endIndex: Math.max(0, totalCount - 1),
    topSpacerPx: 0,
    bottomSpacerPx: 0,
  };
  if (totalCount < CHAT_LIST_VIRTUALIZE_MIN_ROWS || metrics.layoutH <= 0) {
    return disabledWindow;
  }

  const totalHeight = contentTopInsetPx + totalCount * rowStridePx;
  const maxScrollY = Math.max(0, totalHeight - metrics.layoutH);
  let scrollY = Math.min(Math.max(0, metrics.scrollY), maxScrollY);
  // Near the catalog tail, native scroll metrics often oscillate by ~one rowStridePx
  // (e.g. layout/subpixel clamp vs sticky end hysteresis). Treat "within about one row
  // of maxScrollY" as fully bottom so start/end indices and spacers don't flip ±1 row.
  // Use a few px slack so values like maxScroll - row + 0.2 (float noise) still snap.
  const tailSnapSlackPx = 4;
  if (
    maxScrollY > 0 &&
    maxScrollY - scrollY <= rowStridePx + tailSnapSlackPx
  ) {
    scrollY = maxScrollY;
  }
  const rowScrollY = Math.max(0, scrollY - contentTopInsetPx);

  const viewportTop = Math.max(0, rowScrollY - overscanPx);
  const viewportBottom = rowScrollY + metrics.layoutH + overscanPx;

  let rawStartIndex = Math.max(0, Math.floor(viewportTop / rowStridePx));
  let startIndex = rawStartIndex;
  let endIndex = Math.min(totalCount - 1, Math.ceil(viewportBottom / rowStridePx) - 1);

  const sticky = options.stickyWindow;
  // Large scrollbar jumps must not keep a stale sticky band — that leaves empty spacers.
  const stickyJumpPx =
    sticky != null
      ? Math.abs(rawStartIndex - sticky.startIndex) * rowStridePx
      : 0;
  if (sticky && stickyJumpPx <= overscanPx) {
    // Schmitt trigger on viewportTop (same space as startIndex = floor(viewportTop/row)).
    // Old bug mixed rowScrollY with row-index thresholds and used min(sticky, raw) on retreat,
    // so advance hysteresis never applied and startIndex oscillated ±1 at boundaries.
    const hysteresisPx = rowStridePx * 0.35;
    const s = sticky.startIndex;
    const e = sticky.endIndex;
    if (rawStartIndex !== s) {
      if (rawStartIndex > s) {
        startIndex =
          viewportTop < (s + 1) * rowStridePx + hysteresisPx ? s : rawStartIndex;
      } else {
        // Hold sticky s while viewportTop is still below the upper edge of row s
        // by less than hysteresis (retreat only after scrolling up past s*row - hyst).
        startIndex =
          viewportTop > s * rowStridePx - hysteresisPx ? s : rawStartIndex;
      }
    } else {
      startIndex = s;
    }
    if (endIndex < e) {
      const shrinkAt = e * rowStridePx - metrics.layoutH + hysteresisPx;
      if (rowScrollY > shrinkAt) {
        endIndex = e;
      }
    } else if (endIndex > e) {
      endIndex = Math.max(e, endIndex);
    }
    if (endIndex < startIndex) {
      endIndex = startIndex;
    }
  }

  // When snapped to the scroll bottom, always include the last virtual row so sticky
  // endIndex shrink logic cannot alternate 135/136 with subpixel scrollY.
  if (maxScrollY > 0 && scrollY >= maxScrollY - 1e-6) {
    endIndex = totalCount - 1;
    if (endIndex < startIndex) {
      endIndex = startIndex;
    }
  }

  return {
    enabled: true,
    startIndex,
    endIndex,
    topSpacerPx: startIndex * rowStridePx,
    bottomSpacerPx: Math.max(0, (totalCount - endIndex - 1) * rowStridePx),
  };
}

/** Drop tier-3 rows outside 2× overscan of the virtual window; cap total tier-3 rows. */
export function pruneTier3ChatRows(
  rows: MessageChatRowData[],
  window: ChatListVirtualWindow,
  rowStridePx: number = MESSAGE_ROW_HEIGHT_PX,
  overscanPx: number = CHAT_LIST_VIRTUAL_OVERSCAN_PX,
  tier3Cap: number = CHAT_LIST_TIER3_CLIENT_CAP,
): MessageChatRowData[] {
  const tier3Rows = rows.filter((row) => resolveChatListTier(row) === "unpositioned");
  if (tier3Rows.length === 0) return rows;

  const overscanRows = Math.ceil((overscanPx * 2) / rowStridePx);
  const keepStart = Math.max(0, window.startIndex - overscanRows);
  const keepEnd = Math.min(rows.length, window.endIndex + overscanRows + 1);
  const keepIds = new Set<number>();
  for (let index = keepStart; index < keepEnd; index += 1) {
    const row = rows[index];
    if (row && resolveChatListTier(row) === "unpositioned") {
      keepIds.add(row.telegram_chat_id);
    }
  }

  let tier3Kept = 0;
  const next: MessageChatRowData[] = [];
  for (const row of rows) {
    if (resolveChatListTier(row) !== "unpositioned") {
      next.push(row);
      continue;
    }
    if (!keepIds.has(row.telegram_chat_id)) continue;
    if (tier3Kept >= tier3Cap) continue;
    next.push(row);
    tier3Kept += 1;
  }
  return next.length === rows.length ? rows : next;
}
