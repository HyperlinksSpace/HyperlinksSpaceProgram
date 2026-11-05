import assert from "node:assert/strict";
import {
  chatListCatalogTailWithinPrefetch,
  resolveChatListVirtualWindow,
} from "../chatListVirtualWindow.js";
import {
  noteChatListPageLoaded,
  resetChatListScrollPagination,
  chatListScrollHasMore,
} from "../../../telegram/chatListScrollPagination.js";

resetChatListScrollPagination();
noteChatListPageLoaded(25, 10, 40);
assert.equal(
  chatListScrollHasMore(),
  true,
  "short final page must still hasMore when loadedThrough < totalCount",
);

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
