import { getTransactionStats } from "../getTransactionStats.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Show my transaction stats",
    ...overrides
  };
}

describe("getTransactionStats", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        listForOwnerFiltered: async () => []
      }
    });

    const result = await getTransactionStats(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getTransactionStats");
    expect(result.data).toBeNull();
    expect(result.displayData?.summary).toContain("No transactions");
  });

  it("returns ok result with correct sent/received totals", async () => {
    const debit1 = makeTransactionRecord({ id: "d1", type: "debit", amount: 100 });
    const debit2 = makeTransactionRecord({ id: "d2", type: "debit", amount: 50 });
    const credit1 = makeTransactionRecord({ id: "c1", type: "credit", amount: 200 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        listForOwnerFiltered: async () => [debit1, debit2, credit1]
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

    const result = await getTransactionStats(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as {
      count: number;
      sentTotal: number;
      receivedTotal: number;
      net: number;
    };
    expect(data.count).toBe(3);
    expect(data.sentTotal).toBe(150);
    expect(data.receivedTotal).toBe(200);
    expect(data.net).toBe(50);
  });

  it("returns ok result with zero totals for sent-only transactions", async () => {
    const debit = makeTransactionRecord({ id: "d1", type: "debit", amount: 80 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        listForOwnerFiltered: async () => [debit]
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

    const result = await getTransactionStats(makeContext());
    const data = result.data as { receivedTotal: number; net: number };
    expect(data.receivedTotal).toBe(0);
    expect(data.net).toBe(-80);
  });

  it("summary mentions total count and sent/received amounts", async () => {
    const d = makeTransactionRecord({ id: "d1", type: "debit", amount: 100 });
    const c = makeTransactionRecord({ id: "c1", type: "credit", amount: 150 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        listForOwnerFiltered: async () => [d, c]
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

    const result = await getTransactionStats(makeContext());
    const summary = result.displayData?.summary ?? "";
    expect(summary).toContain("2 total");
    expect(summary).toContain("100.00");
    expect(summary).toContain("150.00");
  });

  it("summary includes largest sent when present", async () => {
    const d1 = makeTransactionRecord({ id: "d1", type: "debit", amount: 400 });
    const d2 = makeTransactionRecord({ id: "d2", type: "debit", amount: 100 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        listForOwnerFiltered: async () => [d1, d2]
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

    const result = await getTransactionStats(makeContext());
    expect(result.displayData?.summary).toContain("largest sent 400.00 ILS");
  });

  it("metadata.amount equals net value", async () => {
    const d = makeTransactionRecord({ id: "d1", type: "debit", amount: 60 });
    const c = makeTransactionRecord({ id: "c1", type: "credit", amount: 100 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        listForOwnerFiltered: async () => [d, c]
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

    const result = await getTransactionStats(makeContext());
    const data = result.data as { net: number };
    expect(result.displayData?.metadata?.amount).toBe(data.net);
  });
});
