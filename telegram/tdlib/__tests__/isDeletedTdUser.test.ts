import assert from "node:assert/strict";
import { isDeletedTdUser } from "../tdUserProfile.js";

assert.equal(isDeletedTdUser({ type: { _: "userTypeDeleted" } }), true);
assert.equal(isDeletedTdUser({ type: { _: "userTypeRegular" } }), false);
assert.equal(isDeletedTdUser({ type: { _: "userTypeBot" } }), false);
assert.equal(isDeletedTdUser({ type: "deleted" }), true);
assert.equal(isDeletedTdUser(null), false);
assert.equal(isDeletedTdUser({}), false);

console.log("isDeletedTdUser.test.ts: ok");
