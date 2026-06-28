import { getCounterpartySummary } from "../getCounterpartySummary.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Summary with Bob",
    ...overrides
  };
}

const stubCP = {
  email: "bob@example.com",
  maskedLabel: "b***@example.com",
  firstMentionedAtTurn: 1,
  lastReferencedAtTurn: 1,
  aliases: [] as string[]
};

describe("getCounterpartySummary", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no counterparty is resolved", async () => {
    cleanup = withRepos();
    const result = await getCounterpartySummary(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getCounterpartySummary");
    expect(result.displayData?.summary).toContain("specific counterparty");
  });

  it("returns empty result when transaction count is 0", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 0, debitCount: 0
        }),
        recentWithCounterparty: async () => []
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

    const result = await getCounterpartySummary(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.status).toBe("empty");
    expect(result.displayData?.summary).toContain("No transactions");
  });

  it("returns ok result with correct totals when transactions exist (debit only)", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 200 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 200, debitCount: 2
        }),
        recentWithCounterparty: async () => [tx]
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

    const result = await getCounterpartySummary(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.status).toBe("ok");
    const data = result.data as { totalSent: number; totalReceived: number; net: number };
    expect(data.totalSent).toBe(200);
    expect(data.totalReceived).toBe(0);
    expect(data.net).toBe(-200);
  });

  it("returns ok result with positive net when received > sent", async () => {
    const tx = makeTransactionRecord({ type: "credit", amount: 300 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 300, creditCount: 1, debitTotal: 100, debitCount: 1
        }),
        recentWithCounterparty: async () => [tx]
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

    const result = await getCounterpartySummary(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.status).toBe("ok");
    const data = result.data as { totalSent: number; totalReceived: number; net: number };
    expect(data.net).toBe(200);
    expect(result.displayData?.summary).toContain("net 200.00");
  });

  it("summary mentions 'transfers' in plural when count > 1", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 50 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 100, debitCount: 2
        }),
        recentWithCounterparty: async () => [tx]
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

    const result = await getCounterpartySummary(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.displayData?.summary).toContain("2 transfers");
  });

  it("summary mentions 'transfer' in singular when sentCount is 1", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 50 });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 50, debitCount: 1
        }),
        recentWithCounterparty: async () => [tx]
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

    const result = await getCounterpartySummary(makeContext({ resolvedCounterparty: stubCP }));
    // Should say "1 transfer" not "1 transfers"
    expect(result.displayData?.summary).toMatch(/\b1 transfer\b/);
    expect(result.displayData?.summary).not.toContain("1 transfers");
  });
});
