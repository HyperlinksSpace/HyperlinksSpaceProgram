import assert from "node:assert/strict";
import {
  chatListCatalogPhantomRowCount,
  chatListCatalogTailWithinPrefetch,
  resolveChatListVirtualWindow,
} from "../chatListVirtualWindow.js";
import {
  noteChatListPageLoaded,
  resetChatListScrollPagination,
  chatListScrollHasMore,
  takeChatListScrollFetchOffset,
  getChatListLoadedPages,
} from "../../../telegram/chatListScrollPagination.js";

resetChatListScrollPagination();
noteChatListPageLoaded(0, 25, 514);
// Silent polls repeat offset=0 — must not advance the scroll cursor.
noteChatListPageLoaded(0, 18, 514);
assert.equal(getChatListLoadedPages(), 1);
assert.equal(takeChatListScrollFetchOffset(), 25);
noteChatListPageLoaded(25, 25, 514);
assert.equal(getChatListLoadedPages(), 2);
assert.equal(takeChatListScrollFetchOffset(), 50);
assert.equal(
  chatListScrollHasMore(),
  true,
  "short final page must still hasMore when loadedThrough < totalCount",
);

resetChatListScrollPagination();
noteChatListPageLoaded(25, 10, 40);
assert.equal(
  chatListScrollHasMore(),
  true,
  "short final page must still hasMore when loadedThrough < totalCount",
);

{
  const phantom = chatListCatalogPhantomRowCount(88, 485);
  assert.ok(phantom >= 25, "partial catalog should reserve phantom tail rows for prefetch");
  assert.equal(chatListCatalogPhantomRowCount(485, 485), 0);
}

{
  const row = 55;
  const total = 100;
  const layout = 514;
  const inset = 0;
  const totalHeight = inset + total * row;
  const maxScroll = totalHeight - layout;
  const nearTail = chatListCatalogTailWithinPrefetch(
    total,
    { scrollY: maxScroll - 100, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset, prefetchPx: row * 9 },
  );
  assert.equal(nearTail, true, "viewport near catalog tail should prefetch");
  const far = chatListCatalogTailWithinPrefetch(
    total,
    { scrollY: 0, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset, prefetchPx: row * 9 },
  );
  assert.equal(far, false, "viewport at top should not prefetch tail");
}

{
  const window = resolveChatListVirtualWindow(
    100,
    { scrollY: 4000, layoutH: 514 },
    { rowStridePx: 55, contentTopInsetPx: 0 },
  );
  assert.ok(window.bottomSpacerPx >= 0);
}

console.log("chatListCatalogScrollLoad.test.ts ok");
