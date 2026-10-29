import { describe, expect, it } from "vitest";

import { sanitizeSwapAmountInput } from "../sanitizeSwapAmountInput";

describe("sanitizeSwapAmountInput", () => {
  it("strips non-numeric characters", () => {
    expect(sanitizeSwapAmountInput("12a3")).toBe("123");
  });

  it("allows one decimal separator", () => {
    expect(sanitizeSwapAmountInput("1.2.3")).toBe("1.23");
    expect(sanitizeSwapAmountInput("0,5")).toBe("0,5");
  });
});
