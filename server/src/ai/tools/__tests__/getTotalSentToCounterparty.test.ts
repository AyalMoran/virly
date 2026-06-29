import { getTotalSentToCounterparty } from "../getTotalSentToCounterparty.js";
import { withRepos } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "How much did I send Bob in total?",
    ...overrides
  };
}

const stubCP = {
  email: "bob@example.com",
  maskedLabel: "b***@example.com",
  userLabel: "bob@example.com",
  displayName: "Bob",
  firstMentionedAtTurn: 1,
  lastReferencedAtTurn: 1,
  aliases: [] as string[]
};

describe("getTotalSentToCounterparty", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no counterparty is resolved", async () => {
    cleanup = withRepos();
    const result = await getTotalSentToCounterparty(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getTotalSentToCounterparty");
    expect(result.displayData?.summary).toContain("specific recipient");
  });

  it("returns empty result when debit count is 0", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 50, creditCount: 1, debitTotal: 0, debitCount: 0
        })
      }
    });

    const result = await getTotalSentToCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.status).toBe("empty");
    expect(result.displayData?.summary).toContain("No sent transactions");
  });

  it("returns ok result with total and count when sent transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 750, debitCount: 5
        })
      }
    });

    const result = await getTotalSentToCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.status).toBe("ok");
    const data = result.data as { total: number; count: number };
    expect(data.total).toBe(750);
    expect(data.count).toBe(5);
    expect(result.displayData?.summary).toContain("750.00");
  });

  it("includes a sent totals memory update when transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 300, debitCount: 3
        })
      }
    });

    const result = await getTotalSentToCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.memoryUpdates?.totals).toHaveLength(1);
    expect(result.memoryUpdates?.totals?.[0].direction).toBe("sent");
    expect(result.memoryUpdates?.totals?.[0].amount).toBe(300);
  });

  it("does not include totals memory update when count is 0", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 0, debitCount: 0
        })
      }
    });

    const result = await getTotalSentToCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.memoryUpdates?.totals).toEqual([]);
  });

  it("summary includes 'You have sent' wording on ok result", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 125, debitCount: 1
        })
      }
    });

    const result = await getTotalSentToCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.displayData?.summary).toContain("You have sent");
  });
});
