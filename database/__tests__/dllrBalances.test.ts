import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Keep in sync with `DLLR_REGISTRATION_FROZEN_USD` in database/dllrBalances.ts. */
const DLLR_REGISTRATION_FROZEN_USD = 1;

describe("DLLR registration gift", () => {
  it("is one frozen dollar", () => {
    assert.equal(DLLR_REGISTRATION_FROZEN_USD, 1);
  });
});
