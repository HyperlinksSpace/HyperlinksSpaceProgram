import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitHeaderAmountFontSize,
  pickHeaderDisplayName,
} from "../headerRowFit";
import { formatHeaderWalletBalanceLabel } from "../formatHeaderWalletBalanceLabel";

function headerSnippet(address: string): string {
  const value = address.replace(/\s+/g, "").trim();
  if (!value) return "…";
  if (value.length <= 4) return value;
  return `....${value.slice(-4)}`;
}

describe("walletAddressHeaderSnippet", () => {
  it("shows four dots and the last four characters", () => {
    assert.equal(headerSnippet("UQBY1YxxxxgM-NF8"), "....-NF8");
    assert.equal(headerSnippet("ABCD"), "ABCD");
    assert.equal(headerSnippet(""), "…");
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
  it("keeps the full name when it fits and drops the last token when it does not", () => {
    assert.equal(
      pickHeaderDisplayName({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        availablePx: 200,
        fullNameWidthPx: 120,
        firstNameWidthPx: 40,
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
      }),
      "Ada",
    );
    assert.equal(
      pickHeaderDisplayName({
        fullName: "Ada Lovelace",
        firstName: "Ada",
        availablePx: 20,
        fullNameWidthPx: 120,
        firstNameWidthPx: 40,
      }),
      null,
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
