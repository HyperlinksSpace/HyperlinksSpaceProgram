import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DLLR_REGISTRATION_FROZEN_USD } from "../dllrBalances";

describe("DLLR registration gift", () => {
  it("is one frozen dollar", () => {
    assert.equal(DLLR_REGISTRATION_FROZEN_USD, 1);
  });
});
