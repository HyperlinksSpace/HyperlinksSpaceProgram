import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSwapCoffeeTransactionsToTonConnect } from "../tonSwapSend.js";

describe("mapSwapCoffeeTransactionsToTonConnect", () => {
  it("maps coffee txs like whatswap sendTransaction messages", () => {
    const messages = mapSwapCoffeeTransactionsToTonConnect([
      {
        address: "EQCtest",
        value: "1000000000",
        cell: "te6cckEBAQEAAgAAAA==",
      },
    ]);
    assert.equal(messages[0]?.address, "EQCtest");
    assert.equal(messages[0]?.amount, "1000000000");
    assert.equal(messages[0]?.payload, "te6cckEBAQEAAgAAAA==");
  });
});
