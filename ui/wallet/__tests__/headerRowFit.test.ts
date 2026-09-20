import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compactNavStickAfterPx,
  fitHeaderActionIconSize,
  fitHeaderAmountFontSize,
  pickHeaderDisplayName,
  shouldStickCompactFirstHeaderRow,
} from "../headerRowFit";
import { formatHeaderWalletBalanceLabel } from "../formatHeaderWalletBalanceLabel";
import {
  fitHeaderAddressTailLength,
  walletAddressHeaderSnippet,
} from "../walletAddressFormat";

describe("walletAddressHeaderSnippet", () => {
  it("shows two dots and the last five characters by default", () => {
    assert.equal(walletAddressHeaderSnippet("UQBY1YxxxxgM-NF8"), "..M-NF8");
    assert.equal(walletAddressHeaderSnippet("ABCD"), "ABCD");
    assert.equal(walletAddressHeaderSnippet(""), "…");
  });

  it("never goes below two address characters", () => {
    assert.equal(walletAddressHeaderSnippet("UQBY1YxxxxgM-NF8", 2), "..F8");
    assert.equal(walletAddressHeaderSnippet("UQBY1YxxxxgM-NF8", 1), "..F8");
  });
});

describe("fitHeaderAddressTailLength", () => {
  it("prefers five characters when the identity slot is wide enough", () => {
    assert.equal(
      fitHeaderAddressTailLength({
        identitySlotPx: 200,
        monoCharWidthPx: 9,
        explorerChromePx: 28,
        nameFloorPx: 20,
      }),
      5,
    );
  });

  it("steps down to two when space is tight", () => {
    assert.equal(
      fitHeaderAddressTailLength({
        identitySlotPx: 80,
        monoCharWidthPx: 9,
        explorerChromePx: 28,
        nameFloorPx: 20,
      }),
      2,
    );
  });
});

describe("formatHeaderWalletBalanceLabel", () => {
  it("keeps integer digits and up to two decimals", () => {
    assert.equal(formatHeaderWalletBalanceLabel(0, "en"), "0$");
    assert.equal(formatHeaderWalletBalanceLabel(1, "en"), "1$");
    assert.equal(formatHeaderWalletBalanceLabel(1.5, "en"), "1.5$");
    assert.equal(formatHeaderWalletBalanceLabel(1.56, "en"), "1.56$");
    assert.equal(formatHeaderWalletBalanceLabel(10.49, "en"), "10.49$");
    assert.equal(formatHeaderWalletBalanceLabel(1234.56, "en"), "1,234.56$");
    assert.equal(formatHeaderWalletBalanceLabel(1_234_567.89, "en"), "1,234,567.89$");
  });
});

describe("pickHeaderDisplayName", () => {
  it("keeps the full name when it fits and floors to one letter when tight", () => {
    assert.equal(
      pickHeaderDisplayName({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        availablePx: 200,
        fullNameWidthPx: 120,
        firstNameWidthPx: 40,
        firstLetterWidthPx: 12,
      }),
      "Ada Lovelace",
    );
    assert.equal(
      pickHeaderDisplayName({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        availablePx: 80,
        fullNameWidthPx: 120,
        firstNameWidthPx: 40,
        firstLetterWidthPx: 12,
      }),
      "Ada",
    );
    assert.equal(
      pickHeaderDisplayName({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        availablePx: 10,
        fullNameWidthPx: 120,
        firstNameWidthPx: 40,
        firstLetterWidthPx: 12,
      }),
      "A",
    );
    assert.equal(
      pickHeaderDisplayName({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        availablePx: 0,
        fullNameWidthPx: 0,
        firstNameWidthPx: 0,
        slotReady: false,
        previous: "Ada",
      }),
      "Ada",
    );
  });
});

describe("fitHeaderAmountFontSize", () => {
  it("keeps 30px when the amount fits and scales down when it does not", () => {
    assert.equal(fitHeaderAmountFontSize(80, 120), 30);
    assert.equal(fitHeaderAmountFontSize(120, 80), 20);
    assert.equal(fitHeaderAmountFontSize(120, 60), 15);
  });
});

describe("fitHeaderActionIconSize", () => {
  it("keeps the max size when the cluster fits and scales when the slot is tighter", () => {
    assert.deepEqual(fitHeaderActionIconSize(200), { sizePx: 24, gapPx: 12 });
    const tight = fitHeaderActionIconSize(90);
    assert.equal(tight.sizePx < 24, true);
    assert.equal(tight.sizePx >= 12, true);
    assert.equal(5 * tight.sizePx + 4 * tight.gapPx <= 90, true);
  });
});

describe("shouldStickCompactFirstHeaderRow", () => {
  it("pins only when the top inset is a camera-sized band", () => {
    assert.equal(shouldStickCompactFirstHeaderRow(0), false);
    assert.equal(shouldStickCompactFirstHeaderRow(22), false);
    assert.equal(shouldStickCompactFirstHeaderRow(40), true);
    assert.equal(shouldStickCompactFirstHeaderRow(59), true);
  });
});

describe("compactNavStickAfterPx", () => {
  it("locks Feed/Messages after the first row when that row is not pinned", () => {
    assert.equal(
      compactNavStickAfterPx({
        stickFirstRow: false,
        firstRowHeightPx: 50,
        collapsibleHeightPx: 80,
      }),
      130,
    );
    assert.equal(
      compactNavStickAfterPx({
        stickFirstRow: true,
        firstRowHeightPx: 50,
        collapsibleHeightPx: 80,
      }),
      80,
    );
  });
});
