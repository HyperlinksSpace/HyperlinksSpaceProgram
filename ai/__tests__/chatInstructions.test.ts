import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAiColumnChatInstructions,
  HSP_GENERAL_PURPOSE_CHAT_INSTRUCTIONS,
  HSP_PRODUCT_CHAT_INSTRUCTIONS,
  shouldInjectProgramContext,
} from "../chatInstructions.js";

describe("chatInstructions for explicit model", () => {
  it("uses general-purpose instructions when a model is pinned", () => {
    const text = buildAiColumnChatInstructions({
      modelMode: "model",
      modelId: "openai/gpt-6-astra",
    });
    assert.equal(text, HSP_GENERAL_PURPOSE_CHAT_INSTRUCTIONS);
    assert.match(text, /general-purpose/i);
    assert.match(text, /not only this app/i);
  });

  it("keeps product instructions for auto and tinymodel", () => {
    assert.equal(
      buildAiColumnChatInstructions({ modelMode: "auto" }),
      HSP_PRODUCT_CHAT_INSTRUCTIONS,
    );
    assert.equal(
      buildAiColumnChatInstructions({ modelMode: "tinymodel" }),
      HSP_PRODUCT_CHAT_INSTRUCTIONS,
    );
    assert.equal(buildAiColumnChatInstructions(null), HSP_PRODUCT_CHAT_INSTRUCTIONS);
  });

  it("skips program RAG injection when a model is pinned", () => {
    assert.equal(
      shouldInjectProgramContext({
        modelMode: "model",
        modelId: "openai/gpt-6-astra",
      }),
      false,
    );
    assert.equal(shouldInjectProgramContext({ modelMode: "auto" }), true);
    assert.equal(shouldInjectProgramContext({ modelMode: "tinymodel" }), true);
  });
});
