import {
  getTransactionDirection,
  getAmountFiltersFromMessage,
  getExactAmountFromMessage,
  getReasonQueryFromMessage,
  getTransactionSortFromMessage,
  getTransactionSortLabel,
  summarizeTransactionRows,
  summarizeTransactionRowsForLlm,
  transactionMemoryUpdatesFromRows,
  sortForTransactionMemory,
  getDirectionFromMessage,
  getTransactionLimit,
  buildTransactionFilterCriteria
} from "../transactionHelpers.js";
import type { SafeTransactionRow } from "../transactionHelpers.js";
import type { ToolContext } from "../../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<SafeTransactionRow> = {}): SafeTransactionRow {
  return {
    transactionId: "tx1",
    label: "1. sent 100.00 ILS with Alice (alice@example.com)",
    llmLabel: "1. sent 100.00 ILS with a***@example.com",
    direction: "sent",
    amount: 100,
    currency: "ILS",
    counterpartyLabel: "Alice (alice@example.com)",
    counterpartyMaskedLabel: "a***@example.com",
    counterpartyEmail: "alice@example.com",
    reason: null,
    occurredAt: "2024-01-01T00:00:00.000Z",
    status: "completed",
    ...overrides
  };
}

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    ...extra
  };
}

// ---------------------------------------------------------------------------
// getTransactionDirection
// ---------------------------------------------------------------------------

describe("getTransactionDirection", () => {
  it("returns 'sent' for debit transactions", () => {
    expect(getTransactionDirection({ type: "debit" })).toBe("sent");
  });

  it("returns 'received' for credit transactions", () => {
    expect(getTransactionDirection({ type: "credit" })).toBe("received");
  });
});

// ---------------------------------------------------------------------------
// getAmountFiltersFromMessage
// ---------------------------------------------------------------------------

describe("getAmountFiltersFromMessage", () => {
  it("extracts min amount from 'over X'", () => {
    const result = getAmountFiltersFromMessage("show me transfers over 100");
    expect(result.minAmount).toBe(100);
    expect(result.maxAmount).toBeUndefined();
  });

  it("extracts max amount from 'under X'", () => {
    const result = getAmountFiltersFromMessage("transactions under 50.50");
    expect(result.maxAmount).toBe(50.5);
    expect(result.minAmount).toBeUndefined();
  });

  it("extracts both min and max", () => {
    const result = getAmountFiltersFromMessage("over 10 and under 200");
    expect(result.minAmount).toBe(10);
    expect(result.maxAmount).toBe(200);
  });

  it("returns undefined for both when no amount filters", () => {
    const result = getAmountFiltersFromMessage("show me recent transactions");
    expect(result.minAmount).toBeUndefined();
    expect(result.maxAmount).toBeUndefined();
  });

  it("handles 'more than' variant", () => {
    const result = getAmountFiltersFromMessage("more than 250 ILS");
    expect(result.minAmount).toBe(250);
  });

  it("handles 'less than' variant", () => {
    const result = getAmountFiltersFromMessage("less than 75");
    expect(result.maxAmount).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// getExactAmountFromMessage
// ---------------------------------------------------------------------------

describe("getExactAmountFromMessage", () => {
  it("extracts amount with ILS suffix", () => {
    expect(getExactAmountFromMessage("send 150 ILS")).toBe(150);
  });

  it("extracts amount with shekel symbol", () => {
    expect(getExactAmountFromMessage("transfer ₪200")).toBe(200);
  });

  it("extracts plain number", () => {
    expect(getExactAmountFromMessage("the 75 transfer")).toBe(75);
  });

  it("extracts decimal amount", () => {
    expect(getExactAmountFromMessage("paid 33.50 ILS")).toBe(33.5);
  });

  it("returns undefined for zero", () => {
    expect(getExactAmountFromMessage("0 ILS")).toBeUndefined();
  });

  it("returns undefined for negative (no number found)", () => {
    expect(getExactAmountFromMessage("no amount here")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getReasonQueryFromMessage
// ---------------------------------------------------------------------------

describe("getReasonQueryFromMessage", () => {
  it("extracts reason after 'for' keyword", () => {
    const result = getReasonQueryFromMessage("show transactions for rent");
    expect(result).toBe("rent");
  });

  it("returns undefined when no reason keyword", () => {
    expect(getReasonQueryFromMessage("show me all transactions")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getTransactionSortFromMessage
// ---------------------------------------------------------------------------

describe("getTransactionSortFromMessage", () => {
  it("returns 'oldest' when message contains 'oldest'", () => {
    expect(getTransactionSortFromMessage("show oldest transactions")).toBe("oldest");
  });

  it("returns 'amount_desc' for 'biggest'", () => {
    expect(getTransactionSortFromMessage("show biggest transfers")).toBe("amount_desc");
  });

  it("returns 'amount_asc' for 'smallest'", () => {
    expect(getTransactionSortFromMessage("smallest transactions")).toBe("amount_asc");
  });

  it("returns 'newest' as default", () => {
    expect(getTransactionSortFromMessage("show me transactions")).toBe("newest");
  });

  it("returns 'amount_desc' for 'largest'", () => {
    expect(getTransactionSortFromMessage("largest amount")).toBe("amount_desc");
  });

  it("returns 'amount_asc' for 'lowest'", () => {
    expect(getTransactionSortFromMessage("lowest amount")).toBe("amount_asc");
  });
});

// ---------------------------------------------------------------------------
// getTransactionSortLabel
// ---------------------------------------------------------------------------

describe("getTransactionSortLabel", () => {
  it("returns 'oldest' label", () => {
    expect(getTransactionSortLabel("show oldest first")).toBe("oldest");
  });

  it("returns 'largest amount' label", () => {
    expect(getTransactionSortLabel("biggest transactions")).toBe("largest amount");
  });

  it("returns 'smallest amount' label", () => {
    expect(getTransactionSortLabel("smallest amounts")).toBe("smallest amount");
  });

  it("returns 'newest' by default", () => {
    expect(getTransactionSortLabel("show me transactions")).toBe("newest");
  });
});

// ---------------------------------------------------------------------------
// getDirectionFromMessage
// ---------------------------------------------------------------------------

describe("getDirectionFromMessage", () => {
  it("detects 'received' from keyword", () => {
    const ctx = makeContext("show received transactions");
    expect(getDirectionFromMessage(ctx)).toBe("received");
  });

  it("detects 'sent' from keyword", () => {
    const ctx = makeContext("show sent transfers");
    expect(getDirectionFromMessage(ctx)).toBe("sent");
  });

  it("returns 'both' when no direction keyword", () => {
    const ctx = makeContext("show all transactions");
    expect(getDirectionFromMessage(ctx)).toBe("both");
  });

  it("prefers slot value over message parsing", () => {
    const ctx = makeContext("show received transactions", {
      requestSlots: {
        intent: "transaction_search",
        transactionDirection: "sent"
      }
    });
    expect(getDirectionFromMessage(ctx)).toBe("sent");
  });

  it("detects 'received' from 'incoming'", () => {
    const ctx = makeContext("incoming deposits this month");
    expect(getDirectionFromMessage(ctx)).toBe("received");
  });
});

// ---------------------------------------------------------------------------
// getTransactionLimit
// ---------------------------------------------------------------------------

describe("getTransactionLimit", () => {
  it("returns default limit when no number in message", () => {
    const ctx = makeContext("show recent transactions");
    expect(getTransactionLimit(ctx, 10)).toBe(10);
  });

  it("extracts limit from message", () => {
    const ctx = makeContext("show last 5 transactions");
    expect(getTransactionLimit(ctx, 10)).toBe(5);
  });

  it("caps at maxLimit (50)", () => {
    const ctx = makeContext("show last 99 transactions");
    expect(getTransactionLimit(ctx, 10)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// summarizeTransactionRows
// ---------------------------------------------------------------------------

describe("summarizeTransactionRows", () => {
  it("summarizes a single row without reason", () => {
    const row = makeRow({ label: "1. sent 50.00 ILS with Bob", reason: null });
    expect(summarizeTransactionRows([row])).toBe("1. sent 50.00 ILS with Bob");
  });

  it("includes reason in summary", () => {
    const row = makeRow({ label: "1. sent 50.00 ILS with Bob", reason: "dinner" });
    expect(summarizeTransactionRows([row])).toBe("1. sent 50.00 ILS with Bob for dinner");
  });

  it("joins multiple rows with semicolons", () => {
    const rows = [makeRow({ label: "1. sent 10.00 ILS" }), makeRow({ label: "2. received 20.00 ILS" })];
    expect(summarizeTransactionRows(rows)).toBe("1. sent 10.00 ILS; 2. received 20.00 ILS");
  });

  it("returns empty string for empty array", () => {
    expect(summarizeTransactionRows([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// summarizeTransactionRowsForLlm
// ---------------------------------------------------------------------------

describe("summarizeTransactionRowsForLlm", () => {
  it("uses llmLabel instead of label", () => {
    const row = makeRow({
      llmLabel: "1. sent 50.00 ILS with a***@example.com",
      reason: null
    });
    expect(summarizeTransactionRowsForLlm([row])).toBe("1. sent 50.00 ILS with a***@example.com");
  });

  it("appends reason when present", () => {
    const row = makeRow({
      llmLabel: "1. sent 50.00 ILS with a***@example.com",
      reason: "groceries"
    });
    expect(summarizeTransactionRowsForLlm([row])).toBe(
      "1. sent 50.00 ILS with a***@example.com for groceries"
    );
  });
});

// ---------------------------------------------------------------------------
// transactionMemoryUpdatesFromRows
// ---------------------------------------------------------------------------

describe("transactionMemoryUpdatesFromRows", () => {
  it("maps rows to memory update shape", () => {
    const row = makeRow({
      transactionId: "tx42",
      label: "1. sent 100.00 ILS with Alice",
      counterpartyLabel: "Alice",
      amount: 100,
      currency: "ILS",
      direction: "sent",
      occurredAt: "2024-01-01T00:00:00.000Z"
    });
    const result = transactionMemoryUpdatesFromRows([row]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      transactionId: "tx42",
      amount: 100,
      direction: "sent"
    });
  });

  it("returns empty transactions array for empty input", () => {
    const result = transactionMemoryUpdatesFromRows([]);
    expect(result.transactions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sortForTransactionMemory
// ---------------------------------------------------------------------------

describe("sortForTransactionMemory", () => {
  it("sorts by turnLastReferenced descending", () => {
    const arr = [
      { turnLastReferenced: 1, turnIntroduced: 0 },
      { turnLastReferenced: 3, turnIntroduced: 0 },
      { turnLastReferenced: 2, turnIntroduced: 0 }
    ];
    arr.sort(sortForTransactionMemory);
    expect(arr.map((x) => x.turnLastReferenced)).toEqual([3, 2, 1]);
  });

  it("breaks ties by turnIntroduced ascending", () => {
    const arr = [
      { turnLastReferenced: 5, turnIntroduced: 3 },
      { turnLastReferenced: 5, turnIntroduced: 1 }
    ];
    arr.sort(sortForTransactionMemory);
    expect(arr[0].turnIntroduced).toBe(1);
    expect(arr[1].turnIntroduced).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// buildTransactionFilterCriteria
// ---------------------------------------------------------------------------

describe("buildTransactionFilterCriteria", () => {
  it("builds minimal criteria with defaults", () => {
    const ctx = makeContext("show transactions");
    const result = buildTransactionFilterCriteria(ctx, { limit: 10 });
    expect(result.ownerId).toBe("user1");
    expect(result.limit).toBe(10);
    expect(result.sort).toBe("newest");
    expect(result.type).toBeUndefined();
  });

  it("sets type=debit for 'sent' direction", () => {
    const ctx = makeContext("show sent transfers");
    const result = buildTransactionFilterCriteria(ctx, { limit: 5 });
    expect(result.type).toBe("debit");
  });

  it("sets type=credit for 'received' direction", () => {
    const ctx = makeContext("show received transactions");
    const result = buildTransactionFilterCriteria(ctx, { limit: 5 });
    expect(result.type).toBe("credit");
  });

  it("includes counterpartyEmail when resolvedCounterparty is set", () => {
    const ctx = makeContext("transactions with alice", {
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    const result = buildTransactionFilterCriteria(ctx, { limit: 5 });
    expect(result.counterpartyEmail).toBe("alice@example.com");
  });

  it("applies custom sort", () => {
    const ctx = makeContext("oldest transactions");
    const result = buildTransactionFilterCriteria(ctx, { limit: 5, sort: "oldest" });
    expect(result.sort).toBe("oldest");
  });
});
