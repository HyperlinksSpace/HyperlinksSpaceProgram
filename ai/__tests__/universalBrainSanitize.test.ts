import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeUniversalBrainUserText } from "../universalBrain.js";

describe("sanitizeUniversalBrainUserText", () => {
  it("strips Brain trace footer and --- separator", () => {
    const raw =
      "привет, что ты\n\n---\n*Brain trace:* classify:Sci/Tech(0.48) · RAG:2chunk(s)";
    assert.equal(sanitizeUniversalBrainUserText(raw), "привет, что ты");
  });

  it("leaves normal replies unchanged", () => {
    assert.equal(sanitizeUniversalBrainUserText("2 + 2 = 4"), "2 + 2 = 4");
  });
});
