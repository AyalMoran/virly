import { getTransactionReceipt } from "../getTransactionReceipt.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Show me details for that transaction",
    ...overrides
  };
}

describe("getTransactionReceipt", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no resolvedTransactionId is set", async () => {
    cleanup = withRepos();
    const result = await getTransactionReceipt(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getTransactionReceipt");
    expect(result.data).toBeNull();
    expect(result.displayData?.summary).toContain("specific transaction");
  });

  it("returns empty result when the transaction is not found in the repo", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        findByIdForOwner: async () => null
      }
    });

    const result = await getTransactionReceipt(
      makeContext({ resolvedTransactionId: "nonexistent-id" })
    );
    expect(result.status).toBe("empty");
    expect(result.displayData?.summary).toContain("No matching transaction");
  });

  it("returns ok result with debit transaction details", async () => {
    const tx = makeTransactionRecord({
      id: "tx-abc",
      type: "debit",
      counterpartyEmail: "alice@example.com",
      amount: 200,
      reason: "groceries"
    });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        findByIdForOwner: async () => tx
      },
      users: {
        ...({} as any),
        findByEmails: async () => []
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => []
      }
    });

    const result = await getTransactionReceipt(
      makeContext({ resolvedTransactionId: "tx-abc" })
    );
    expect(result.status).toBe("ok");
    const data = result.data as {
      direction: string;
      amount: number;
      reason: string | null;
      transactionId: string;
    };
    expect(data.direction).toBe("sent");
    expect(data.amount).toBe(200);
    expect(data.reason).toBe("groceries");
    expect(data.transactionId).toBe("tx-abc");
  });

  it("returns ok result with credit transaction details", async () => {
    const tx = makeTransactionRecord({
      id: "tx-xyz",
      type: "credit",
      counterpartyEmail: "bob@example.com",
      amount: 350,
      reason: null
    });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        findByIdForOwner: async () => tx
      },
      users: {
        ...({} as any),
        findByEmails: async () => []
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => []
      }
    });

    const result = await getTransactionReceipt(
      makeContext({ resolvedTransactionId: "tx-xyz" })
    );
    expect(result.status).toBe("ok");
    const data = result.data as { direction: string };
    expect(data.direction).toBe("received");
  });

  it("summary includes direction, amount, and currency", async () => {
    const tx = makeTransactionRecord({
      id: "tx-1",
      type: "debit",
      amount: 99.5
    });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        findByIdForOwner: async () => tx
      },
      users: {
        ...({} as any),
        findByEmails: async () => []
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => []
      }
    });

    const result = await getTransactionReceipt(
      makeContext({ resolvedTransactionId: "tx-1" })
    );
    const summary = result.displayData?.summary ?? "";
    expect(summary).toContain("sent");
    expect(summary).toContain("99.50");
    expect(summary).toContain("ILS");
  });

  it("summary includes reason when present", async () => {
    const tx = makeTransactionRecord({ id: "tx-r", type: "debit", amount: 50, reason: "dinner" });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        findByIdForOwner: async () => tx
      },
      users: {
        ...({} as any),
        findByEmails: async () => []
      },
      personalDetails: {
        ...({} as any),
        findProvidedByUserIds: async () => []
      }
    });

    const result = await getTransactionReceipt(
      makeContext({ resolvedTransactionId: "tx-r" })
    );
    expect(result.displayData?.summary).toContain("dinner");
  });
});
