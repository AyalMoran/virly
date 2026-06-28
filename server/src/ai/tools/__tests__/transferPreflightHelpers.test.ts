import {
  startOfLocalDay,
  nextLocalDayStart,
  getAmountFromContext,
  getCurrencyFromContext,
  getRecipientEmailFromContext,
  getMaxSendableNow,
  getLimitReasons
} from "../transferPreflightHelpers.js";
import type { ToolContext } from "../../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    ...extra
  };
}

// ---------------------------------------------------------------------------
// startOfLocalDay
// ---------------------------------------------------------------------------

describe("startOfLocalDay", () => {
  it("returns midnight of the given date", () => {
    const date = new Date("2024-05-15T14:30:00.000Z");
    const result = startOfLocalDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("uses current date when no argument provided", () => {
    const before = new Date();
    const result = startOfLocalDay();
    const after = new Date();
    expect(result.getTime()).toBeLessThanOrEqual(before.getTime() + 1000);
    expect(result.getHours()).toBe(0);
    expect(result.getDate()).toBe(before.getDate());
    void after;
  });

  it("preserves the year, month and day", () => {
    const date = new Date(2025, 3, 10, 18, 45, 0);
    const result = startOfLocalDay(date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// nextLocalDayStart
// ---------------------------------------------------------------------------

describe("nextLocalDayStart", () => {
  it("returns midnight of the next day", () => {
    const date = new Date(2024, 0, 15, 10, 30, 0);
    const result = nextLocalDayStart(date);
    expect(result.getDate()).toBe(16);
    expect(result.getHours()).toBe(0);
  });

  it("handles month-end rollover", () => {
    const date = new Date(2024, 0, 31, 12, 0, 0); // Jan 31
    const result = nextLocalDayStart(date);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(1);
  });

  it("is exactly 1 day after startOfLocalDay", () => {
    const date = new Date(2024, 6, 20);
    const dayStart = startOfLocalDay(date);
    const nextDay = nextLocalDayStart(date);
    const diff = nextDay.getTime() - dayStart.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// getAmountFromContext
// ---------------------------------------------------------------------------

describe("getAmountFromContext", () => {
  it("prefers slot value over message parsing", () => {
    const ctx = makeContext("send 50 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        amount: { value: 200, currency: "ILS", currencyMentioned: true }
      }
    });
    expect(getAmountFromContext(ctx)).toBe(200);
  });

  it("falls back to parsing the message", () => {
    const ctx = makeContext("send 75 ILS");
    expect(getAmountFromContext(ctx)).toBe(75);
  });

  it("returns undefined when no amount found", () => {
    const ctx = makeContext("show me my balance");
    expect(getAmountFromContext(ctx)).toBeUndefined();
  });

  it("ignores slot amount of 0", () => {
    const ctx = makeContext("send 100 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        amount: { value: 0, currency: "ILS" }
      }
    });
    // Slot 0 is not > 0 so fallback to message
    expect(getAmountFromContext(ctx)).toBe(100);
  });

  it("ignores negative slot amount", () => {
    const ctx = makeContext("send 55 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        amount: { value: -10, currency: "ILS" }
      }
    });
    expect(getAmountFromContext(ctx)).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// getCurrencyFromContext
// ---------------------------------------------------------------------------

describe("getCurrencyFromContext", () => {
  it("returns ILS supported when no slot", () => {
    const ctx = makeContext("send money");
    const result = getCurrencyFromContext(ctx);
    expect(result.supported).toBe(true);
    expect(result.currency).toBe("ILS");
  });

  it("returns supported=false when non-ILS currency mentioned", () => {
    const ctx = makeContext("send 100 USD", {
      requestSlots: {
        intent: "transfer_prepare",
        amount: { currency: "USD", currencyMentioned: true }
      }
    });
    const result = getCurrencyFromContext(ctx);
    expect(result.supported).toBe(false);
    expect(result.currency).toBe("USD");
  });

  it("returns supported=true when ILS is mentioned", () => {
    const ctx = makeContext("send 100 ILS", {
      requestSlots: {
        intent: "transfer_prepare",
        amount: { currency: "ILS", currencyMentioned: true }
      }
    });
    const result = getCurrencyFromContext(ctx);
    expect(result.supported).toBe(true);
  });

  it("returns supported=true when currency not mentioned", () => {
    const ctx = makeContext("send 100", {
      requestSlots: {
        intent: "transfer_prepare",
        amount: { currency: "USD", currencyMentioned: false }
      }
    });
    const result = getCurrencyFromContext(ctx);
    expect(result.supported).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRecipientEmailFromContext
// ---------------------------------------------------------------------------

describe("getRecipientEmailFromContext", () => {
  it("prefers explicitEmail slot", () => {
    const ctx = makeContext("send to alice@example.com", {
      requestSlots: {
        intent: "transfer_prepare",
        counterparty: { explicitEmail: "Alice@Example.COM" }
      }
    });
    expect(getRecipientEmailFromContext(ctx)).toBe("alice@example.com");
  });

  it("falls back to resolvedCounterparty.email", () => {
    const ctx = makeContext("send money", {
      resolvedCounterparty: {
        email: "Bob@Example.COM",
        maskedLabel: "b***@example.com",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    expect(getRecipientEmailFromContext(ctx)).toBe("bob@example.com");
  });

  it("returns undefined when no email available", () => {
    const ctx = makeContext("send money");
    expect(getRecipientEmailFromContext(ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getMaxSendableNow
// ---------------------------------------------------------------------------

describe("getMaxSendableNow", () => {
  it("returns min of balance, perTransferLimit, and dailyRemaining", () => {
    // config defaults: perTransferLimit=500, dailyTransferLimit=1000
    const result = getMaxSendableNow({ balance: 300, dailyRemaining: 400 });
    // min(300, 500, 400) = 300
    expect(result).toBe(300);
  });

  it("is capped by perTransferLimit", () => {
    const result = getMaxSendableNow({ balance: 1000, dailyRemaining: 1000 });
    // min(1000, 500, 1000) = 500
    expect(result).toBe(500);
  });

  it("is capped by dailyRemaining", () => {
    const result = getMaxSendableNow({ balance: 1000, dailyRemaining: 50 });
    // min(1000, 500, 50) = 50
    expect(result).toBe(50);
  });

  it("returns 0 when balance is 0", () => {
    expect(getMaxSendableNow({ balance: 0, dailyRemaining: 1000 })).toBe(0);
  });

  it("returns 0 when dailyRemaining is negative", () => {
    expect(getMaxSendableNow({ balance: 100, dailyRemaining: -5 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getLimitReasons
// ---------------------------------------------------------------------------

describe("getLimitReasons", () => {
  const validInput = { balance: 1000, dailyRemaining: 1000, currencySupported: true };

  it("returns no reasons when all conditions pass", () => {
    const reasons = getLimitReasons({ ...validInput, amount: 100 });
    expect(reasons).toHaveLength(0);
  });

  it("adds UNSUPPORTED_CURRENCY when currency not supported", () => {
    const reasons = getLimitReasons({ ...validInput, currencySupported: false });
    expect(reasons.some((r) => r.code === "UNSUPPORTED_CURRENCY")).toBe(true);
  });

  it("adds INSUFFICIENT_BALANCE when amount > balance", () => {
    const reasons = getLimitReasons({ balance: 50, dailyRemaining: 1000, currencySupported: true, amount: 100 });
    expect(reasons.some((r) => r.code === "INSUFFICIENT_BALANCE")).toBe(true);
  });

  it("adds EXCEEDS_PER_TRANSFER_LIMIT when amount > 500 (default)", () => {
    const reasons = getLimitReasons({ ...validInput, amount: 501 });
    expect(reasons.some((r) => r.code === "EXCEEDS_PER_TRANSFER_LIMIT")).toBe(true);
  });

  it("adds EXCEEDS_DAILY_LIMIT when amount > dailyRemaining", () => {
    const reasons = getLimitReasons({ balance: 1000, dailyRemaining: 10, currencySupported: true, amount: 50 });
    expect(reasons.some((r) => r.code === "EXCEEDS_DAILY_LIMIT")).toBe(true);
  });

  it("can add multiple reasons at once", () => {
    const reasons = getLimitReasons({ balance: 5, dailyRemaining: 3, currencySupported: false, amount: 600 });
    const codes = reasons.map((r) => r.code);
    expect(codes).toContain("UNSUPPORTED_CURRENCY");
    expect(codes).toContain("INSUFFICIENT_BALANCE");
    expect(codes).toContain("EXCEEDS_PER_TRANSFER_LIMIT");
    expect(codes).toContain("EXCEEDS_DAILY_LIMIT");
  });

  it("returns no balance/limit reasons when amount is undefined", () => {
    const reasons = getLimitReasons({ balance: 10, dailyRemaining: 10, currencySupported: true, amount: undefined });
    expect(reasons.filter((r) => r.code !== "UNSUPPORTED_CURRENCY")).toHaveLength(0);
  });
});
