import {
  createToolResult,
  getToolDisplayData,
  toAssistantToolResult,
  sanitizeToolResultMetadata,
  toSafeToolSummary,
  getUserVisibleSummary,
  getResolutionResultData
} from "../toolResults.js";
import type { RuntimeToolResult, ToolResultMetadata } from "../state.js";

function makeResult(overrides: Partial<RuntimeToolResult> = {}): RuntimeToolResult {
  return createToolResult({
    toolName: "getAccountBalance",
    status: "ok",
    data: { balance: 1234 },
    summary: "Balance is 1234",
    ...overrides
  });
}

describe("createToolResult", () => {
  test("sets toolName, status, data correctly", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: { balance: 500 },
      summary: "Balance is 500"
    });
    expect(result.toolName).toBe("getAccountBalance");
    expect(result.status).toBe("ok");
    expect(result.data).toStrictEqual({ balance: 500 });
  });

  test("stores summary inside displayData", () => {
    const result = createToolResult({
      toolName: "getRecentTransactions",
      status: "ok",
      data: null,
      summary: "No transactions found"
    });
    expect((result.displayData as { summary: string }).summary).toBe("No transactions found");
  });

  test("stores userSummary and userSummaryHe in displayData", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Balance: 100",
      userSummary: "Your balance is 100 ILS",
      userSummaryHe: "היתרה שלך היא 100 ש\"ח"
    });
    const displayData = result.displayData as {
      summary: string;
      userSummary?: string;
      userSummaryHe?: string;
      metadata: Record<string, unknown>;
    };
    expect(displayData.userSummary).toBe("Your balance is 100 ILS");
    expect(displayData.userSummaryHe).toBe("היתרה שלך היא 100 ש\"ח");
  });

  test("defaults metadata to empty object when not provided", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "empty",
      data: null,
      summary: ""
    });
    const displayData = result.displayData as { metadata: Record<string, unknown> };
    expect(displayData.metadata).toStrictEqual({});
  });

  test("stores memoryUpdates", () => {
    const memoryUpdates = {
      transactions: [
        {
          transactionId: "tx1",
          label: "Test tx",
          amount: 100,
          currency: "ILS",
          direction: "sent" as const,
          occurredAt: "2024-01-01T00:00:00Z"
        }
      ]
    };
    const result = createToolResult({
      toolName: "getRecentTransactions",
      status: "ok",
      data: null,
      summary: "1 transaction",
      memoryUpdates
    });
    expect(result.memoryUpdates).toStrictEqual(memoryUpdates);
  });

  test("handles status 'error'", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "error",
      data: null,
      summary: "An error occurred"
    });
    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });
});

describe("getToolDisplayData", () => {
  test("returns displayData when present", () => {
    const result = makeResult();
    const displayData = getToolDisplayData(result);
    expect(displayData.summary).toBe("Balance is 1234");
    expect(displayData.metadata).toStrictEqual({});
  });

  test("returns fallback with empty summary when displayData is missing", () => {
    const result: RuntimeToolResult = {
      toolName: "getAccountBalance",
      status: "ok",
      data: null
    };
    const displayData = getToolDisplayData(result);
    expect(displayData.summary).toBe("");
    expect(displayData.metadata).toStrictEqual({});
  });
});

describe("toAssistantToolResult", () => {
  test("maps toolName and summary from displayData", () => {
    const result = makeResult();
    const assistantResult = toAssistantToolResult(result);
    expect(assistantResult.toolName).toBe("getAccountBalance");
    expect(assistantResult.summary).toBe("Balance is 1234");
  });

  test("maps metadata from displayData", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Balance",
      metadata: { accountLabel: "Main account" }
    });
    const assistantResult = toAssistantToolResult(result);
    expect(assistantResult.metadata).toStrictEqual({ accountLabel: "Main account" });
  });
});

describe("sanitizeToolResultMetadata", () => {
  test("strips counterpartyEmail from top-level metadata", () => {
    const metadata: ToolResultMetadata = {
      counterpartyEmail: "alice@example.com",
      recordCount: 5
    };
    const safe = sanitizeToolResultMetadata(metadata);
    expect(safe).not.toHaveProperty("counterpartyEmail");
    expect(safe.recordCount).toBe(5);
  });

  test("strips counterpartyEmail from counterparties array items", () => {
    const metadata: ToolResultMetadata = {
      counterparties: [
        {
          counterpartyEmail: "alice@example.com",
          maskedLabel: "a***@example.com"
        }
      ]
    };
    const safe = sanitizeToolResultMetadata(metadata);
    expect(safe.counterparties).toBeDefined();
    const parties = safe.counterparties as Array<Record<string, unknown>>;
    expect(parties[0]).not.toHaveProperty("counterpartyEmail");
    expect(parties[0].maskedLabel).toBe("a***@example.com");
  });

  test("strips counterpartyEmail from counterpartyCandidates", () => {
    const metadata: ToolResultMetadata = {
      counterpartyCandidates: [
        {
          counterpartyEmail: "bob@example.com",
          maskedLabel: "b***@example.com"
        }
      ]
    };
    const safe = sanitizeToolResultMetadata(metadata);
    const candidates = safe.counterpartyCandidates as Array<Record<string, unknown>>;
    expect(candidates[0]).not.toHaveProperty("counterpartyEmail");
  });

  test("passes through transactions, transactionCandidates, pendingTransfers, pendingTransferCandidates", () => {
    const metadata: ToolResultMetadata = {
      transactions: [
        {
          transactionId: "tx1",
          label: "Payment",
          amount: 200,
          currency: "ILS",
          direction: "sent",
          occurredAt: "2024-01-01T00:00:00Z"
        }
      ]
    };
    const safe = sanitizeToolResultMetadata(metadata);
    expect(safe.transactions).toBeDefined();
    expect((safe.transactions as Array<unknown>)[0]).toHaveProperty("transactionId", "tx1");
  });

  test("handles empty metadata", () => {
    const safe = sanitizeToolResultMetadata({});
    expect(safe).toStrictEqual({});
  });
});

describe("toSafeToolSummary", () => {
  test("returns toolName and sanitized summary", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Balance is 100",
      metadata: {
        counterpartyEmail: "alice@example.com",
        accountLabel: "Primary"
      }
    });
    const safe = toSafeToolSummary(result);
    expect(safe.toolName).toBe("getAccountBalance");
    expect(safe.summary).toBe("Balance is 100");
    expect(safe.metadata).not.toHaveProperty("counterpartyEmail");
    expect(safe.metadata.accountLabel).toBe("Primary");
  });
});

describe("getUserVisibleSummary", () => {
  test("returns userSummary when present and no locale", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Machine summary",
      userSummary: "Human-readable summary"
    });
    expect(getUserVisibleSummary(result)).toBe("Human-readable summary");
  });

  test("returns userSummaryHe when locale is 'he' and present", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Machine summary",
      userSummary: "English summary",
      userSummaryHe: "Hebrew summary"
    });
    expect(getUserVisibleSummary(result, "he")).toBe("Hebrew summary");
  });

  test("falls back to userSummary when locale is 'he' but userSummaryHe is absent", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Machine summary",
      userSummary: "English summary"
    });
    expect(getUserVisibleSummary(result, "he")).toBe("English summary");
  });

  test("falls back to summary when no userSummary", () => {
    const result = createToolResult({
      toolName: "getAccountBalance",
      status: "ok",
      data: null,
      summary: "Machine summary"
    });
    expect(getUserVisibleSummary(result)).toBe("Machine summary");
  });
});

describe("getResolutionResultData", () => {
  test("returns data when kind is 'counterparty' and status is 'resolved'", () => {
    const resolvedData = {
      kind: "counterparty" as const,
      status: "resolved" as const,
      counterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com"
      }
    };
    const result: RuntimeToolResult = {
      toolName: "resolveCounterpartyCandidates",
      status: "ok",
      data: resolvedData
    };
    const extracted = getResolutionResultData(result);
    expect(extracted).toStrictEqual(resolvedData);
  });

  test("returns data when kind is 'counterparty' and status is 'ambiguous'", () => {
    const ambiguousData = {
      kind: "counterparty" as const,
      status: "ambiguous" as const
    };
    const result: RuntimeToolResult = {
      toolName: "resolveCounterpartyCandidates",
      status: "ok",
      data: ambiguousData
    };
    expect(getResolutionResultData(result)).toStrictEqual(ambiguousData);
  });

  test("returns data when kind is 'transaction' and status is 'resolved'", () => {
    const resolvedData = {
      kind: "transaction" as const,
      status: "resolved" as const,
      transactionId: "tx-123"
    };
    const result: RuntimeToolResult = {
      toolName: "resolveTransactionReference",
      status: "ok",
      data: resolvedData
    };
    expect(getResolutionResultData(result)).toStrictEqual(resolvedData);
  });

  test("returns data when kind is 'pending_transfer' and status is 'unresolved'", () => {
    const data = {
      kind: "pending_transfer" as const,
      status: "unresolved" as const
    };
    const result: RuntimeToolResult = {
      toolName: "resolvePendingTransferReference",
      status: "ok",
      data
    };
    expect(getResolutionResultData(result)).toStrictEqual(data);
  });

  test("returns undefined when data is null", () => {
    const result: RuntimeToolResult = {
      toolName: "getAccountBalance",
      status: "error",
      data: null
    };
    expect(getResolutionResultData(result)).toBeUndefined();
  });

  test("returns undefined when data is not an object", () => {
    const result: RuntimeToolResult = {
      toolName: "getAccountBalance",
      status: "ok",
      data: "not-an-object"
    };
    expect(getResolutionResultData(result)).toBeUndefined();
  });

  test("returns undefined when kind is invalid", () => {
    const result: RuntimeToolResult = {
      toolName: "getAccountBalance",
      status: "ok",
      data: { kind: "invalid_kind", status: "resolved" }
    };
    expect(getResolutionResultData(result)).toBeUndefined();
  });

  test("returns undefined when status is invalid", () => {
    const result: RuntimeToolResult = {
      toolName: "resolveCounterpartyCandidates",
      status: "ok",
      data: { kind: "counterparty", status: "invalid_status" }
    };
    expect(getResolutionResultData(result)).toBeUndefined();
  });
});
