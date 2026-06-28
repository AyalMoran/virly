import { shouldHold } from "../holds.js";

describe("shouldHold policy", () => {
  test("'off' never holds", () => {
    expect(shouldHold("high", "off")).toBe(false);
    expect(shouldHold("medium", "off")).toBe(false);
    expect(shouldHold("low", "off")).toBe(false);
  });

  test("'high' holds only high-risk transfers", () => {
    expect(shouldHold("high", "high")).toBe(true);
    expect(shouldHold("medium", "high")).toBe(false);
    expect(shouldHold("low", "high")).toBe(false);
  });

  test("'medium' holds medium and high", () => {
    expect(shouldHold("high", "medium")).toBe(true);
    expect(shouldHold("medium", "medium")).toBe(true);
    expect(shouldHold("low", "medium")).toBe(false);
  });
});
