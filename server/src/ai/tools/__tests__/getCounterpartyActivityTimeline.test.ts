import { getCounterpartyActivityTimeline } from "../getCounterpartyActivityTimeline.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Show activity with Bob",
    ...overrides
  };
}

describe("getCounterpartyActivityTimeline", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no counterparty is resolved", async () => {
    cleanup = withRepos();
    const result = await getCounterpartyActivityTimeline(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getCounterpartyActivityTimeline");
    expect(result.data).toEqual([]);
    expect(result.displayData?.summary).toContain("specific counterparty");
  });

  it("returns empty result when no transactions exist with the counterparty", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
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

    const result = await getCounterpartyActivityTimeline(
      makeContext({
        resolvedCounterparty: {
          email: "bob@example.com",
          maskedLabel: "b***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1,
          aliases: []
        }
      })
    );
    expect(result.status).toBe("empty");
    expect(result.displayData?.summary).toContain("No recent activity");
  });

  it("returns ok result with sent/received summaries when transactions exist", async () => {
    const debit = makeTransactionRecord({ type: "debit", amount: 50, reason: "lunch" });
    const credit = makeTransactionRecord({ id: "tx-2", type: "credit", amount: 30, reason: null });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentWithCounterparty: async () => [debit, credit]
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

    const result = await getCounterpartyActivityTimeline(
      makeContext({
        resolvedCounterparty: {
          email: "bob@example.com",
          maskedLabel: "b***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1,
          aliases: []
        }
      })
    );

    expect(result.status).toBe("ok");
    const data = result.data as string[];
    expect(data.length).toBe(2);
    expect(data[0]).toContain("sent 50.00 ILS");
    expect(data[0]).toContain("for lunch");
    expect(data[1]).toContain("received 30.00 ILS");
  });

  it("includes memory updates with counterparty info on ok result", async () => {
    const tx = makeTransactionRecord({ type: "debit", amount: 75, reason: null });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
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

    const result = await getCounterpartyActivityTimeline(
      makeContext({
        resolvedCounterparty: {
          email: "bob@example.com",
          maskedLabel: "b***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1,
          aliases: []
        }
      })
    );

    expect(result.memoryUpdates?.counterparties).toHaveLength(1);
    expect(result.memoryUpdates?.counterparties?.[0].relation).toBe("both");
    expect(result.memoryUpdates?.counterparties?.[0].source).toBe("transaction");
  });
});
