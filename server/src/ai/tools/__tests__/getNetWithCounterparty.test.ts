import { getNetWithCounterparty } from "../getNetWithCounterparty.js";
import { withRepos } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "What is the net with Bob?",
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

describe("getNetWithCounterparty", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no counterparty is resolved", async () => {
    cleanup = withRepos();
    const result = await getNetWithCounterparty(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getNetWithCounterparty");
    expect(result.displayData?.summary).toContain("specific counterparty");
  });

  it("returns empty result when no transactions exist with the counterparty", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 0, creditCount: 0, debitTotal: 0, debitCount: 0
        })
      }
    });

    const result = await getNetWithCounterparty(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.status).toBe("empty");
    expect(result.displayData?.summary).toContain("No transactions");
  });

  it("returns ok with positive net when received > sent", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 500, creditCount: 2, debitTotal: 100, debitCount: 1
        })
      }
    });

    const result = await getNetWithCounterparty(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.status).toBe("ok");
    const data = result.data as {
      receivedAmount: number;
      sentAmount: number;
      netAmount: number;
      count: number;
    };
    expect(data.receivedAmount).toBe(500);
    expect(data.sentAmount).toBe(100);
    expect(data.netAmount).toBe(400);
    expect(data.count).toBe(3);
  });

  it("returns ok with negative net when sent > received", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 50, creditCount: 1, debitTotal: 300, debitCount: 3
        })
      }
    });

    const result = await getNetWithCounterparty(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.status).toBe("ok");
    const data = result.data as { netAmount: number };
    expect(data.netAmount).toBe(-250);
    expect(result.displayData?.summary).toContain("you have sent them more");
  });

  it("summary shows 'they have sent you more' when net is positive", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 200, creditCount: 1, debitTotal: 50, debitCount: 1
        })
      }
    });

    const result = await getNetWithCounterparty(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.displayData?.summary).toContain("they have sent you more");
  });

  it("summary shows 'you are even' when net is zero", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 100, creditCount: 1, debitTotal: 100, debitCount: 1
        })
      }
    });

    const result = await getNetWithCounterparty(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.displayData?.summary).toContain("you are even");
  });

  it("includes a totals memory update when transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDirectionalTotals: async () => ({
          creditTotal: 100, creditCount: 1, debitTotal: 50, debitCount: 1
        })
      }
    });

    const result = await getNetWithCounterparty(makeContext({ resolvedCounterparty: stubCP }));
    expect(result.memoryUpdates?.totals).toHaveLength(1);
    expect(result.memoryUpdates?.totals?.[0].direction).toBe("net");
  });
});
