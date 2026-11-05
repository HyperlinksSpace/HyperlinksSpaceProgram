import { CHAT_LIST_API_PAGE_SIZE } from "../hooks/useChatListViewport";
import {
  chatListScrollCatalogPartial,
  chatListScrollHasMore,
  getChatListLoadedPages,
  repairChatListPaginationFromClient,
} from "./chatListScrollPagination";

/**
 * Telegram Web / TDLib `loadChats`: append one server slice at a time (messages.chatsSlice).
 * Coalesces like swap jettons `requestSwapJettonsNextPage`.
 */
export type ChatListScrollPageLoader = (options: {
  fromScroll: true;
  allowAvatarResync?: boolean;
}) => Promise<void>;

let scrollPageLoader: ChatListScrollPageLoader | null = null;
let scrollLoadPromise: Promise<void> | null = null;

export function registerChatListScrollPageLoader(loader: ChatListScrollPageLoader | null): void {
  scrollPageLoader = loader;
}

export function requestChatListCatalogNextPage(
  loadedChatCount: number,
  serverTotal: number,
  options?: { allowAvatarResync?: boolean },
): boolean {
  repairChatListPaginationFromClient(loadedChatCount, serverTotal);
  const loadedThrough = getChatListLoadedPages() * CHAT_LIST_API_PAGE_SIZE;
  if (serverTotal > 0 && loadedThrough >= serverTotal) return false;
  if (!chatListScrollHasMore()) return false;
  if (!scrollPageLoader) return false;

  const run = async () => {
    await scrollPageLoader!({
      fromScroll: true,
      allowAvatarResync: options?.allowAvatarResync,
    });
  };

  if (scrollLoadPromise) {
    void scrollLoadPromise.finally(() => {
      if (!chatListScrollHasMore() || scrollLoadPromise) return;
      scrollLoadPromise = run().finally(() => {
        scrollLoadPromise = null;
      });
    });
    return true;
  }

  scrollLoadPromise = run().finally(() => {
    scrollLoadPromise = null;
  });
  return true;
}

/** Gateway tier paging only after scroll slices caught up (Telegram Web defers bulk sync). */
export function chatListGatewayLoadMoreAllowed(
  loadedChatCount: number,
  serverTotal: number,
): boolean {
  return !chatListScrollCatalogPartial(loadedChatCount, serverTotal);
}
