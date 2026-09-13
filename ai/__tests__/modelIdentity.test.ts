import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildModelIdentityAnswer,
  detectIdentityReplyLanguage,
  isModelIdentityQuestion,
} from "../modelIdentity.js";

describe("modelIdentity language", () => {
  it("detects RU for Cyrillic identity questions", () => {
    assert.equal(
      detectIdentityReplyLanguage("какая твоя версия, че ты за модель ии"),
      "ru",
    );
    assert.equal(detectIdentityReplyLanguage("what model are you"), "en");
  });

  it("matches RU identity questions", () => {
    assert.equal(isModelIdentityQuestion("какая твоя версия, че ты за модель ии"), true);
  });

  it("answers model disclosure in Russian when asked in Russian", () => {
    const text = buildModelIdentityAnswer(
      { modelMode: "model", modelId: "openai/gpt-6-astra" },
      { input: "какая твоя версия, че ты за модель ии" },
    );
    assert.match(text, /В AI tools выбрана/);
    assert.match(text, /GPT-6 Astra/);
    assert.match(text, /openai\/gpt-6-astra/);
    assert.doesNotMatch(text, /You selected/);
  });

  it("answers model disclosure in English when asked in English", () => {
    const text = buildModelIdentityAnswer(
      { modelMode: "model", modelId: "openai/gpt-6-astra" },
      { input: "what model are you" },
    );
    assert.match(text, /You selected/);
    assert.match(text, /general-purpose/i);
    assert.doesNotMatch(text, /В AI tools выбрана/);
  });
});
