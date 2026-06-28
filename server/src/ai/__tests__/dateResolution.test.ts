import {
  messageContainsHebrewDate,
  resolveCommonDateRange
} from "../dateResolution.js";

// A fixed reference instant so the relative ranges are deterministic.
const NOW = new Date(2026, 5, 17, 12, 0, 0); // Wed 17 Jun 2026, local time

function resolve(message: string) {
  return resolveCommonDateRange(message, "Asia/Jerusalem", NOW);
}

describe("resolveCommonDateRange", () => {
  test("returns undefined when no known phrase is present", () => {
    expect(resolve("show me everything")).toBeUndefined();
  });

  test.each([
    ["yesterday", "yesterday", "day"],
    ["what did I do today", "today", "day"],
    ["last week summary", "last week", "week"],
    ["this week please", "this week", "week"],
    ["last month report", "last month", "month"],
    ["this month total", "this month", "month"]
  ])("English %s -> label %s / granularity %s", (msg, label, granularity) => {
    const result = resolve(msg);
    expect(result?.label).toBe(label);
    expect(result?.granularity).toBe(granularity);
    expect(result?.confidence).toBe("high");
    expect(new Date(result!.resolvedFrom).getTime()).toBeLessThan(
      new Date(result!.resolvedTo).getTime()
    );
  });

  test("recognises Hebrew phrases", () => {
    expect(resolve("מה קרה אתמול")?.label).toBe("yesterday");
    expect(resolve("היום")?.label).toBe("today");
    expect(resolve("שבוע שעבר")?.label).toBe("last week");
    expect(resolve("החודש")?.label).toBe("this month");
  });

  test("carries through the original text and timezone", () => {
    const result = resolve("today");
    expect(result?.originalText).toBe("today");
    expect(result?.timezone).toBe("Asia/Jerusalem");
  });
});

describe("messageContainsHebrewDate", () => {
  test("detects any Hebrew character", () => {
    expect(messageContainsHebrewDate("אתמול")).toBe(true);
    expect(messageContainsHebrewDate("hello")).toBe(false);
  });
});
