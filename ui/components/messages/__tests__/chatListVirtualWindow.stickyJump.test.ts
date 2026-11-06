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

// Tail sub-row oscillation (e.g. maxScroll clamp noise) must not change the window.
{
  const row = 55;
  const total = 90;
  const layout = 514;
  const inset = 0;
  const totalHeight = inset + total * row;
  const maxScroll = totalHeight - layout;
  const base = resolveChatListVirtualWindow(
    total,
    { scrollY: maxScroll, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
  );
  const nudgeDown = resolveChatListVirtualWindow(
    total,
    { scrollY: maxScroll - row + 10, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
  );
  const nudgeUp = resolveChatListVirtualWindow(
    total,
    { scrollY: maxScroll - row + 20, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
  );
  assert.equal(nudgeDown.startIndex, base.startIndex, "tail snap keeps startIndex stable");
  assert.equal(nudgeDown.endIndex, base.endIndex, "tail snap keeps endIndex stable");
  assert.equal(nudgeUp.startIndex, base.startIndex);
  assert.equal(nudgeUp.endIndex, base.endIndex);
}

// Sub-row gap just below one-row-from-max (e.g. maxScroll - rowStride + 0.2) must still snap.
{
  const row = 55;
  const total = 118;
  const layout = 514;
  const inset = 0;
  const totalHeight = inset + total * row;
  const maxScroll = totalHeight - layout;
  const base = resolveChatListVirtualWindow(
    total,
    { scrollY: maxScroll, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
  );
  const floatNoise = resolveChatListVirtualWindow(
    total,
    { scrollY: maxScroll - row + 0.2, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset },
  );
  assert.equal(floatNoise.startIndex, base.startIndex, "sub-row tail noise snaps startIndex");
  assert.equal(floatNoise.endIndex, base.endIndex, "sub-row tail noise snaps endIndex");
}

// Sticky shrink must not hide the last row when the raw viewport already includes it
// (at maxScroll, rawEndIndex is last; old logic could keep endIndex stuck at sticky e).
{
  const row = 55;
  const total = 150;
  const layout = 669;
  const inset = 0;
  const maxScrollY = Math.max(0, inset + total * row - layout);
  const sticky = { startIndex: 88, endIndex: 121 };
  const scrolled = resolveChatListVirtualWindow(
    total,
    { scrollY: maxScrollY, layoutH: layout },
    { rowStridePx: row, contentTopInsetPx: inset, stickyWindow: sticky },
  );
  assert.equal(
    scrolled.endIndex,
    total - 1,
    "at scroll bottom, endIndex includes last virtual row even if sticky end lags",
  );
}

console.log("chatListVirtualWindow.stickyJump.test.ts: ok");
