import assert from "node:assert/strict";
import {
  CHAT_LIST_VIRTUAL_OVERSCAN_PX,
  resolveChatListVirtualWindow,
} from "../chatListVirtualWindow.js";

const ROW = 72;
const TOTAL = 80;
const LAYOUT = 480;

// Small nudge keeps sticky startIndex.
{
  const first = resolveChatListVirtualWindow(
    TOTAL,
    { scrollY: 0, layoutH: LAYOUT },
    { rowStridePx: ROW, stickyWindow: null },
  );
  const nudged = resolveChatListVirtualWindow(
    TOTAL,
    { scrollY: ROW * 0.2, layoutH: LAYOUT },
    {
      rowStridePx: ROW,
      stickyWindow: { startIndex: first.startIndex, endIndex: first.endIndex },
    },
  );
  assert.equal(
    nudged.startIndex,
    first.startIndex,
    "small scroll should keep sticky startIndex",
  );
}

// Large scrub jump must move the window (no empty spacer under the thumb).
{
  const top = resolveChatListVirtualWindow(
    TOTAL,
    { scrollY: 0, layoutH: LAYOUT },
    { rowStridePx: ROW, stickyWindow: null },
  );
  const jumpY = CHAT_LIST_VIRTUAL_OVERSCAN_PX + ROW * 12;
  const jumped = resolveChatListVirtualWindow(
    TOTAL,
    { scrollY: jumpY, layoutH: LAYOUT },
    {
      rowStridePx: ROW,
      stickyWindow: { startIndex: top.startIndex, endIndex: top.endIndex },
    },
  );
  const expectedStart = Math.max(
    0,
    Math.floor(Math.max(0, jumpY - CHAT_LIST_VIRTUAL_OVERSCAN_PX) / ROW),
  );
  assert.equal(
    jumped.startIndex,
    expectedStart,
    "large scrub jump must recompute startIndex without sticky lag",
  );
  assert.ok(jumped.startIndex > top.startIndex, "jumped window should advance");
}

console.log("chatListVirtualWindow.stickyJump.test.ts: ok");
