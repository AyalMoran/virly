import {
  formatCurrency,
  formatDate,
  formatMoneyILS,
  formatRelativeDate,
  getInitials
} from "../format";

describe("formatMoneyILS / formatCurrency", () => {
  test("renders a two-decimal amount with grouped thousands", () => {
    // Separators are locale-dependent; match digits loosely to stay ICU-robust.
    expect(formatMoneyILS(1234.5)).toMatch(/1.234.50/);
    expect(formatCurrency(1234.5)).toMatch(/1.234.50/);
  });

  test("returns a non-empty string for zero", () => {
    expect(typeof formatMoneyILS(0)).toBe("string");
    expect(formatMoneyILS(0)).toMatch(/0.00/);
  });
});

describe("formatDate", () => {
  test("returns a placeholder for a missing value", () => {
    expect(formatDate()).toBe("Pending date");
    expect(formatDate("")).toBe("Pending date");
  });

  test("formats an ISO date into a readable string", () => {
    const out = formatDate("2026-06-01T09:30:00.000Z");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Jun/);
  });
});

describe("formatRelativeDate", () => {
  test("returns a placeholder for a missing value", () => {
    expect(formatRelativeDate()).toBe("Pending");
  });

  test("labels a very recent time as Just now", () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe("Just now");
  });

  test("labels an hours-old time with an h-ago suffix", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(threeHoursAgo)).toBe("3h ago");
  });

  test("labels a day-old time as Yesterday", () => {
    const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(yesterday)).toBe("Yesterday");
  });
});

describe("getInitials", () => {
  test("takes the first letter of up to two local-part segments", () => {
    expect(getInitials("alice.smith@example.com")).toBe("AS");
  });

  test("pads a single-segment local part with its second character", () => {
    expect(getInitials("bob@example.com")).toBe("BO");
  });
});
