import { getRecentTransactions } from "../getRecentTransactions.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Show my recent transactions",
    ...overrides
  };
}

describe("getRecentTransactions", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => []
      }
    });

    const result = await getRecentTransactions(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getRecentTransactions");
    expect(result.data).toEqual([]);
    expect(result.displayData?.summary).toContain("No recent transactions");
  });

  it("returns ok result with transaction rows", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 150, reason: "rent" });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => [tx]
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

    const result = await getRecentTransactions(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as Array<{
      direction: string;
      amount: number;
      reason: string | null;
    }>;
    expect(data).toHaveLength(1);
    expect(data[0].direction).toBe("sent");
    expect(data[0].amount).toBe(150);
    expect(data[0].reason).toBe("rent");
  });

  it("returns ok result with credit transaction as received", async () => {
    const tx = makeTransactionRecord({ type: "credit", amount: 300 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => [tx]
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

    const result = await getRecentTransactions(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as Array<{ direction: string }>;
    expect(data[0].direction).toBe("received");
  });

  it("passes date range to repository query when resolvedDateRange is set", async () => {
    const captured: Array<{ dateFrom?: Date; dateTo?: Date }> = [];
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async (criteria: { dateFrom?: Date; dateTo?: Date }) => {
          captured.push({ dateFrom: criteria.dateFrom, dateTo: criteria.dateTo });
          return [];
        }
      }
    });

    const from = new Date("2024-06-01");
    const to = new Date("2024-06-30");
    await getRecentTransactions(
      makeContext({
        resolvedDateRange: { from, to, label: "June 2024" }
      })
    );

    expect(captured[0].dateFrom).toEqual(from);
    expect(captured[0].dateTo).toEqual(to);
  });

  it("includes date range in memory update when resolvedDateRange is set", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 50 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => [tx]
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

    const from = new Date("2024-06-01");
    const to = new Date("2024-06-30");
    const result = await getRecentTransactions(
      makeContext({
        resolvedDateRange: { from, to, label: "June 2024" }
      })
    );

    expect(result.memoryUpdates?.dateRanges).toHaveLength(1);
    expect(result.memoryUpdates?.dateRanges?.[0].label).toBe("June 2024");
  });

  it("does not include dateRanges in memory update when no resolvedDateRange", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 50 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => [tx]
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

    const result = await getRecentTransactions(makeContext());
    expect(result.memoryUpdates?.dateRanges).toBeUndefined();
  });
});
