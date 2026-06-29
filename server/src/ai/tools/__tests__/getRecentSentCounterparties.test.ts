import { getRecentSentCounterparties } from "../getRecentSentCounterparties.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Who did I send money to recently?",
    ...overrides
  };
}

describe("getRecentSentCounterparties", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no sent transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => []
      }
    });

    const result = await getRecentSentCounterparties(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getRecentSentCounterparties");
    expect(result.data).toEqual([]);
    expect(result.displayData?.summary).toContain("No recent sent counterparties");
  });

  it("returns ok result with deduplicated counterparties", async () => {
    const tx1 = makeTransactionRecord({
      id: "tx-1",
      type: "debit",
      counterpartyEmail: "alice@example.com",
      amount: 100,
      createdAt: new Date("2024-06-01")
    });
    const tx2 = makeTransactionRecord({
      id: "tx-2",
      type: "debit",
      counterpartyEmail: "alice@example.com",
      amount: 50,
      createdAt: new Date("2024-06-02")
    });
    const tx3 = makeTransactionRecord({
      id: "tx-3",
      type: "debit",
      counterpartyEmail: "bob@example.com",
      amount: 75,
      createdAt: new Date("2024-06-03")
    });

    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => [tx1, tx2, tx3]
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

    const result = await getRecentSentCounterparties(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as Array<{ emailFull: string }>;
    // alice appears twice in raw transactions but should be deduplicated
    const aliceEntries = data.filter((d) => d.emailFull === "alice@example.com");
    expect(aliceEntries).toHaveLength(1);
  });

  it("limits counterparties to the extracted limit from message", async () => {
    const transactions = Array.from({ length: 10 }, (_, i) =>
      makeTransactionRecord({
        id: `tx-${i}`,
        type: "debit",
        counterpartyEmail: `user${i}@example.com`,
        amount: 10 + i,
        createdAt: new Date("2024-06-01")
      })
    );

    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => transactions
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

    // default limit for getRecentSentCounterparties is 3
    const result = await getRecentSentCounterparties(makeContext());
    const data = result.data as unknown[];
    expect(data.length).toBeLessThanOrEqual(3);
  });

  it("includes memory updates with sent_to relation", async () => {
    const tx = makeTransactionRecord({
      type: "debit",
      counterpartyEmail: "carol@example.com",
      amount: 40,
      createdAt: new Date("2024-06-01")
    });
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

    const result = await getRecentSentCounterparties(makeContext());
    expect(result.memoryUpdates?.counterparties?.[0].relation).toBe("sent_to");
  });
});
