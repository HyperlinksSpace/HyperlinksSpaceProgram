import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDllrLedgerKind } from "../dllrLedgerKind.js";
import { applyDllrSameKindTransfer } from "../dllrLedgerTransfer.js";

describe("parseDllrLedgerKind", () => {
  it("accepts hot and frozen", () => {
    assert.equal(parseDllrLedgerKind("hot"), "hot");
    assert.equal(parseDllrLedgerKind(" Frozen "), "frozen");
  });

  it("rejects unknown values", () => {
    assert.equal(parseDllrLedgerKind("total"), null);
    assert.equal(parseDllrLedgerKind(1), null);
  });
});

describe("applyDllrSameKindTransfer", () => {
  const alice = { username: "alice", hotUsd: 5, frozenUsd: 1 };
  const bob = { username: "bob", hotUsd: 0, frozenUsd: 0 };

  it("moves hot to hot and leaves frozen untouched", () => {
    const result = applyDllrSameKindTransfer({
      from: alice,
      to: bob,
      amountUsd: 2,
      ledgerKind: "hot",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.from.hotUsd, 3);
    assert.equal(result.from.frozenUsd, 1);
    assert.equal(result.to.hotUsd, 2);
    assert.equal(result.to.frozenUsd, 0);
  });

  it("moves frozen to frozen and leaves hot untouched", () => {
    const result = applyDllrSameKindTransfer({
      from: alice,
      to: bob,
      amountUsd: 1,
      ledgerKind: "frozen",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.from.hotUsd, 5);
    assert.equal(result.from.frozenUsd, 0);
    assert.equal(result.to.hotUsd, 0);
    assert.equal(result.to.frozenUsd, 1);
  });

  it("rejects when the chosen leg is insufficient even if total covers", () => {
    const result = applyDllrSameKindTransfer({
      from: alice,
      to: bob,
      amountUsd: 2,
      ledgerKind: "frozen",
    });
    assert.deepEqual(result, { ok: false, error: "insufficient_dllr" });
  });
});
