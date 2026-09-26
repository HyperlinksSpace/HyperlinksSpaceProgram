import assert from "node:assert/strict";
import { pinOrderFromListIndex, resolvePinOrder } from "../chatPreview.js";

function comparePinOrderDesc(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (right > left) return 1;
  if (right < left) return -1;
  return 0;
}

// getChats index 0 must sort above index 1, 2, …
const o0 = pinOrderFromListIndex(0);
const o1 = pinOrderFromListIndex(1);
const o2 = pinOrderFromListIndex(2);
assert.ok(comparePinOrderDesc(o0, o1) < 0, "index 0 sorts before index 1");
assert.ok(comparePinOrderDesc(o1, o2) < 0, "index 1 sorts before index 2");

const sorted = [o2, o0, o1].sort(comparePinOrderDesc);
assert.deepEqual(sorted, [o0, o1, o2], "synthetic orders preserve getChats order when sorted desc");

// Prefer real TDLib order over synthetic / previous.
assert.equal(
  resolvePinOrder({ chatOrder: "12345", previousOrder: "1", listIndex: 9 }),
  "12345",
);
assert.equal(
  resolvePinOrder({ chatOrder: "0", previousOrder: "999", listIndex: 3 }),
  "999",
  "keep previous when chat order is still 0",
);
assert.equal(
  resolvePinOrder({ chatOrder: "0", previousOrder: "0", listIndex: 4 }),
  pinOrderFromListIndex(4),
  "fallback to list index when nothing else is usable",
);
assert.equal(resolvePinOrder({ chatOrder: "0" }), "0");

console.log("pinOrderFromListIndex.test.ts: ok");
