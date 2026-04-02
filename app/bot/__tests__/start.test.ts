import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStartMessage, getBotVersion } from "../start.js";

test("getBotVersion prefers BOT_VERSION", () => {
  const prev = process.env.BOT_VERSION;
  process.env.BOT_VERSION = "123";
  try {
    assert.equal(getBotVersion(), "123");
  } finally {
    if (prev === undefined) delete process.env.BOT_VERSION;
    else process.env.BOT_VERSION = prev;
  }
});

test("getBotVersion shortens a SHA to 7 chars", () => {
  const prev = process.env.BOT_VERSION;
  process.env.BOT_VERSION = "0f7f1b5abcdef1234567890";
  try {
    assert.equal(getBotVersion(), "0f7f1b5");
  } finally {
    if (prev === undefined) delete process.env.BOT_VERSION;
    else process.env.BOT_VERSION = prev;
  }
});

test("buildStartMessage includes version tag", () => {
  const prev = process.env.BOT_VERSION;
  process.env.BOT_VERSION = "123";
  try {
    assert.match(buildStartMessage(), /@HyperlinksSpaceBot v\.123/);
  } finally {
    if (prev === undefined) delete process.env.BOT_VERSION;
    else process.env.BOT_VERSION = prev;
  }
});

