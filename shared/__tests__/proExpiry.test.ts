import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarMonths,
  computeProExpiresAtIso,
  formatProExpiryDateLabel,
} from "../proExpiry.js";

describe("proExpiry", () => {
  it("addCalendarMonths clamps month-end overflow", () => {
    const jan31 = new Date(2026, 0, 31, 15, 30, 0);
    const feb = addCalendarMonths(jan31, 1);
    assert.equal(feb.getFullYear(), 2026);
    assert.equal(feb.getMonth(), 1);
    assert.equal(feb.getDate(), 28);
    assert.equal(feb.getHours(), 15);
  });

  it("computeProExpiresAtIso is one calendar month from start", () => {
    const start = Date.UTC(2026, 8, 13, 12, 0, 0);
    const iso = computeProExpiresAtIso({ months: 1, nowMs: start });
    assert.equal(iso, "2026-10-13T12:00:00.000Z");
  });

  it("formatProExpiryDateLabel uses day + lowercase month + year", () => {
    const iso = new Date(2026, 7, 7, 18, 0, 0).toISOString();
    assert.equal(formatProExpiryDateLabel(iso), "7 aug 2026");
  });
});
