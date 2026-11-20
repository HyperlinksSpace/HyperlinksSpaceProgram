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
import { LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS } from "../../../listScrollPageSize.js";

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
  assert.equal(
    chatListCatalogPhantomRowCount(88, 485),
    0,
    "catalog tail is one loader row in the list, not phantom runway spacers",
  );
  assert.equal(chatListCatalogPhantomRowCount(485, 485), 0);
}

{
  const row = 55;
  const loadedChats = 25;
  const total = loadedChats + 25;
  const layout = 514;
  const inset = 0;
  const lead = LIST_SCROLL_CATALOG_TAIL_LEAD_ROWS;
  const thresholdY = loadedChats * row - lead * row;
  const nearLoadedTail = chatListCatalogTailWithinPrefetch(
    total,
    loadedChats,
    { scrollY: thresholdY - row, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
  );
  assert.equal(
    nearLoadedTail,
    true,
    "viewport bottom within tailLeadRows of last loaded row should prefetch",
  );
  const far = chatListCatalogTailWithinPrefetch(
    total,
    loadedChats,
    { scrollY: 0, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
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

resetChatListScrollPagination();
noteChatListPageLoaded(0, 16, 80);
assert.equal(
  takeChatListScrollFetchOffset(),
  16,
  "short first paint must scroll-fetch from row 16, not page boundary 25",
);

console.log("chatListCatalogScrollLoad.test.ts ok");
