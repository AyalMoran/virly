import { getTotalReceivedFromCounterparty } from "../getTotalReceivedFromCounterparty.js";
import { withRepos } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "How much did Bob send me in total?",
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

describe("getTotalReceivedFromCounterparty", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no counterparty is resolved", async () => {
    cleanup = withRepos();
    const result = await getTotalReceivedFromCounterparty(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getTotalReceivedFromCounterparty");
    expect(result.displayData?.summary).toContain("specific counterparty");
  });

  it("returns empty result when credit count is 0", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 100, debitCount: 1
        })
      }
    });

    const result = await getTotalReceivedFromCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.status).toBe("empty");
    expect(result.displayData?.summary).toContain("No received transactions");
  });

  it("returns ok result with total and count when received transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 450, creditCount: 3, debitTotal: 0, debitCount: 0
        })
      }
    });

    const result = await getTotalReceivedFromCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.status).toBe("ok");
    const data = result.data as { total: number; count: number };
    expect(data.total).toBe(450);
    expect(data.count).toBe(3);
    expect(result.displayData?.summary).toContain("450.00");
  });

  it("includes a received totals memory update when transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 200, creditCount: 2, debitTotal: 0, debitCount: 0
        })
      }
    });

    const result = await getTotalReceivedFromCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.memoryUpdates?.totals).toHaveLength(1);
    expect(result.memoryUpdates?.totals?.[0].direction).toBe("received");
    expect(result.memoryUpdates?.totals?.[0].amount).toBe(200);
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

    const result = await getTotalReceivedFromCounterparty(
      makeContext({ resolvedCounterparty: stubCP })
    );
    expect(result.memoryUpdates?.totals).toEqual([]);
  });

  it("normalizes counterparty email before querying", async () => {
    const capturedEmails: string[] = [];
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async (input: { counterpartyEmail: string }) => {
          capturedEmails.push(input.counterpartyEmail);
          return { creditTotal: 100, creditCount: 1, debitTotal: 0, debitCount: 0 };
        }
      }
    });

    await getTotalReceivedFromCounterparty(
      makeContext({
        resolvedCounterparty: {
          ...stubCP,
          email: "  BOB@EXAMPLE.COM  "
        }
      })
    );

    expect(capturedEmails[0]).toBe("bob@example.com");
  });
});
