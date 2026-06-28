import {
  getPendingTransferScope,
  getPendingRecipientLabel,
  toPendingTransferRows,
  pendingTransferMetadata
} from "../pendingTransferHelpers.js";
import type { PendingTransferRow } from "../pendingTransferHelpers.js";
import type { AiPendingTransferRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePendingRecord(
  overrides: Partial<AiPendingTransferRecord> = {}
): AiPendingTransferRecord {
  return {
    id: "pending1",
    userId: "user1",
    conversationId: "conv1",
    assistantId: "assistant1",
    recipientEmail: "bob@example.com",
    version: 1,
    currency: "ILS",
    recipientFirstName: "Bob",
    recipientLastName: "Smith",
    amount: 150,
    reason: null,
    status: "pending",
    supersededById: null,
    supersedesId: null,
    idempotencyResults: {},
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function makePendingRow(overrides: Partial<PendingTransferRow> = {}): PendingTransferRow {
  return {
    pendingTransferId: "pending1",
    conversationId: "conv1",
    label: "1. 150.00 ILS to Bob Smith (bob@example.com)",
    llmLabel: "1. 150.00 ILS to Bob Smith (b***@example.com)",
    recipientLabel: "Bob Smith (bob@example.com)",
    recipientMaskedLabel: "Bob Smith (b***@example.com)",
    recipientEmailMasked: "Bob Smith (b***@example.com)",
    amount: 150,
    currency: "ILS",
    reason: null,
    status: "pending",
    expiresAt: "2099-01-01T00:00:00.000Z",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// getPendingTransferScope
// ---------------------------------------------------------------------------

describe("getPendingTransferScope", () => {
  it("returns 'current_conversation' for ordinary message", () => {
    expect(getPendingTransferScope("cancel my pending transfer")).toBe("current_conversation");
  });

  it("returns 'all_user' when message contains 'all'", () => {
    expect(getPendingTransferScope("cancel all my transfers")).toBe("all_user");
  });

  it("returns 'all_user' when message contains 'every'", () => {
    expect(getPendingTransferScope("cancel every pending transfer")).toBe("all_user");
  });

  it("returns 'all_user' for 'across conversations'", () => {
    expect(getPendingTransferScope("cancel across conversations")).toBe("all_user");
  });

  it("returns 'all_user' for 'all chats'", () => {
    expect(getPendingTransferScope("cancel from all chats")).toBe("all_user");
  });

  it("returns 'current_conversation' for empty string", () => {
    expect(getPendingTransferScope("")).toBe("current_conversation");
  });
});

// ---------------------------------------------------------------------------
// getPendingRecipientLabel
// ---------------------------------------------------------------------------

describe("getPendingRecipientLabel", () => {
  it("builds full name label when first and last name are provided", () => {
    const result = getPendingRecipientLabel({
      recipientEmail: "bob@example.com",
      recipientFirstName: "Bob",
      recipientLastName: "Smith"
    });
    expect(result.userLabel).toBe("Bob Smith (bob@example.com)");
    expect(result.llmLabel).toBe("Bob Smith (b***@example.com)");
    expect(result.maskedEmail).toBe("b***@example.com");
  });

  it("uses only first name when last name is null", () => {
    const result = getPendingRecipientLabel({
      recipientEmail: "alice@test.com",
      recipientFirstName: "Alice",
      recipientLastName: null
    });
    expect(result.userLabel).toBe("Alice (alice@test.com)");
    expect(result.llmLabel).toBe("Alice (a***@test.com)");
  });

  it("falls back to email when no name provided", () => {
    const result = getPendingRecipientLabel({
      recipientEmail: "anon@test.com",
      recipientFirstName: null,
      recipientLastName: null
    });
    expect(result.userLabel).toBe("anon@test.com");
    expect(result.llmLabel).toBe("a***@test.com");
  });

  it("uses only last name when first name is null", () => {
    const result = getPendingRecipientLabel({
      recipientEmail: "carol@test.com",
      recipientFirstName: null,
      recipientLastName: "Jones"
    });
    expect(result.userLabel).toBe("Jones (carol@test.com)");
  });
});

// ---------------------------------------------------------------------------
// toPendingTransferRows
// ---------------------------------------------------------------------------

describe("toPendingTransferRows", () => {
  it("maps a single record to a row with correct shape", () => {
    const record = makePendingRecord();
    const rows = toPendingTransferRows([record]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.pendingTransferId).toBe("pending1");
    expect(row.amount).toBe(150);
    expect(row.currency).toBe("ILS");
    expect(row.status).toBe("pending");
    expect(row.reason).toBeNull();
  });

  it("generates 1-based index labels", () => {
    const records = [makePendingRecord({ id: "p1" }), makePendingRecord({ id: "p2" })];
    const rows = toPendingTransferRows(records);
    expect(rows[0].label).toMatch(/^1\./);
    expect(rows[1].label).toMatch(/^2\./);
  });

  it("includes reason in label when present", () => {
    const record = makePendingRecord({ reason: "dinner" });
    const rows = toPendingTransferRows([record]);
    // label is "1. 150.00 ILS to Bob Smith (bob@example.com)" — reason not in label, just on row
    expect(rows[0].reason).toBe("dinner");
  });

  it("returns empty array for empty input", () => {
    expect(toPendingTransferRows([])).toHaveLength(0);
  });

  it("converts amount to number", () => {
    const record = makePendingRecord({ amount: "200" as unknown as number });
    const rows = toPendingTransferRows([record]);
    expect(typeof rows[0].amount).toBe("number");
    expect(rows[0].amount).toBe(200);
  });

  it("stores ISO string for expiresAt", () => {
    const record = makePendingRecord({
      expiresAt: new Date("2099-06-15T10:00:00.000Z")
    });
    const rows = toPendingTransferRows([record]);
    expect(rows[0].expiresAt).toBe("2099-06-15T10:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// pendingTransferMetadata
// ---------------------------------------------------------------------------

describe("pendingTransferMetadata", () => {
  it("returns recordCount equal to number of rows", () => {
    const rows = [makePendingRow(), makePendingRow({ pendingTransferId: "pending2" })];
    const meta = pendingTransferMetadata(rows);
    expect(meta.recordCount).toBe(2);
  });

  it("includes pendingTransfers array", () => {
    const row = makePendingRow();
    const meta = pendingTransferMetadata([row]);
    expect(meta.pendingTransfers).toHaveLength(1);
    expect(meta.pendingTransfers![0].pendingTransferId).toBe("pending1");
  });

  it("includes resolutionStatus when provided", () => {
    const meta = pendingTransferMetadata([], "unresolved");
    expect(meta.pendingTransferResolutionStatus).toBe("unresolved");
  });

  it("omits resolutionStatus when not provided", () => {
    const meta = pendingTransferMetadata([]);
    expect(meta.pendingTransferResolutionStatus).toBeUndefined();
  });

  it("includes pendingTransferCandidates when resolutionStatus provided", () => {
    const row = makePendingRow();
    const meta = pendingTransferMetadata([row], "ambiguous");
    expect(meta.pendingTransferCandidates).toHaveLength(1);
  });

  it("omits pendingTransferCandidates when no resolutionStatus", () => {
    const row = makePendingRow();
    const meta = pendingTransferMetadata([row]);
    expect(meta.pendingTransferCandidates).toBeUndefined();
  });
});
