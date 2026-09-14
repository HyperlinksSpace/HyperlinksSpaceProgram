import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aiMarkdownToPlainText,
  parseAiMarkdownBlocks,
  summarizeAiMarkdownBlocks,
} from "../aiMarkdownParse.js";

describe("aiMarkdownParse", () => {
  it("renders bold list headings without leaving ** markers in plain text", () => {
    const md = [
      "Основные типы:",
      "",
      "- **Тревожные расстройства**",
      "  - Фобии",
      "  - Панические атаки",
      "",
      "- **Депрессия**",
    ].join("\n");

    const summary = summarizeAiMarkdownBlocks(md);
    assert.ok(summary.some((s) => s.includes("Тревожные")));
    assert.ok(!summary.some((s) => s.includes("**")));

    const plain = aiMarkdownToPlainText(md);
    assert.match(plain, /Тревожные расстройства/);
    assert.doesNotMatch(plain, /\*\*/);
    assert.match(plain, /•/);
  });

  it("parses nested list depth", () => {
    const blocks = parseAiMarkdownBlocks("- A\n  - B");
    assert.equal(blocks[0]?.kind, "list_item");
    assert.equal(blocks[1]?.kind, "list_item");
    if (blocks[0]?.kind === "list_item" && blocks[1]?.kind === "list_item") {
      assert.equal(blocks[0].depth, 0);
      assert.equal(blocks[1].depth, 1);
    }
  });
});
