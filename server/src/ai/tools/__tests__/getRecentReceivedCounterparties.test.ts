import { getRecentReceivedCounterparties } from "../getRecentReceivedCounterparties.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Who sent me money recently?",
    ...overrides
  };
}

describe("getRecentReceivedCounterparties", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no received transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        recentForOwner: async () => []
      }
    });

    const result = await getRecentReceivedCounterparties(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getRecentReceivedCounterparties");
    expect(result.data).toEqual([]);
    expect(result.displayData?.summary).toContain("No recent received counterparties");
  });

  it("returns ok result with deduplicated received counterparties", async () => {
    const tx1 = makeTransactionRecord({
      id: "tx-1",
      type: "credit",
      counterpartyEmail: "dave@example.com",
      amount: 200
    });
    const tx2 = makeTransactionRecord({
      id: "tx-2",
      type: "credit",
      counterpartyEmail: "dave@example.com",
      amount: 50
    });
    const tx3 = makeTransactionRecord({
      id: "tx-3",
      type: "credit",
      counterpartyEmail: "eve@example.com",
      amount: 80
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

    const result = await getRecentReceivedCounterparties(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as Array<{ emailFull: string; amount: number }>;
    const daveEntries = data.filter((d) => d.emailFull === "dave@example.com");
    expect(daveEntries).toHaveLength(1);
    // The first occurrence's amount (200) is used
    expect(daveEntries[0].amount).toBe(200);
  });

  it("includes memory updates with received_from relation", async () => {
    const tx = makeTransactionRecord({
      type: "credit",
      counterpartyEmail: "frank@example.com",
      amount: 90
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

    const result = await getRecentReceivedCounterparties(makeContext());
    expect(result.memoryUpdates?.counterparties?.[0].relation).toBe("received_from");
  });

  it("summary includes 'sent you money' phrasing", async () => {
    const tx = makeTransactionRecord({
      type: "credit",
      counterpartyEmail: "grace@example.com",
      amount: 60
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

    const result = await getRecentReceivedCounterparties(makeContext());
    expect(result.displayData?.summary).toContain("sent you money");
  });
});
