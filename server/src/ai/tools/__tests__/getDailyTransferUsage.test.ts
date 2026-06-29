import { getDailyTransferUsage } from "../getDailyTransferUsage.js";
import { withRepos } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "What is my daily transfer usage?",
    ...overrides
  };
}

describe("getDailyTransferUsage", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns ok result with usage data when no transfers were made today", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDailyDebitUsage: async () => ({ total: 0, count: 0 })
      }
    });

    const result = await getDailyTransferUsage(makeContext());
    expect(result.status).toBe("ok");
    expect(result.toolName).toBe("getDailyTransferUsage");

    const data = result.data as {
      usedToday: number;
      dailyLimit: number;
      remainingToday: number;
      transferCountToday: number;
      resetAt: Date;
    };
    expect(data.usedToday).toBe(0);
    expect(data.transferCountToday).toBe(0);
    expect(data.dailyLimit).toBeGreaterThan(0);
    expect(data.remainingToday).toBe(data.dailyLimit);
  });

  it("returns ok result reflecting partial usage", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDailyDebitUsage: async () => ({ total: 300, count: 2 })
      }
    });

    const result = await getDailyTransferUsage(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as {
      usedToday: number;
      dailyLimit: number;
      remainingToday: number;
      transferCountToday: number;
    };
    expect(data.usedToday).toBe(300);
    expect(data.transferCountToday).toBe(2);
    expect(data.remainingToday).toBe(data.dailyLimit - 300);
  });

  it("summary includes 'used' and 'remaining' text", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDailyDebitUsage: async () => ({ total: 100, count: 1 })
      }
    });

    const result = await getDailyTransferUsage(makeContext());
    const summary = result.displayData?.summary ?? "";
    expect(summary).toContain("used");
    expect(summary).toContain("remaining");
  });

  it("summary uses singular 'transfer' when count is 1", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDailyDebitUsage: async () => ({ total: 50, count: 1 })
      }
    });

    const result = await getDailyTransferUsage(makeContext());
    const summary = result.displayData?.summary ?? "";
    expect(summary).toMatch(/\b1 transfer\b/);
    expect(summary).not.toContain("1 transfers");
  });

  it("summary uses plural 'transfers' when count is more than 1", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDailyDebitUsage: async () => ({ total: 200, count: 3 })
      }
    });

    const result = await getDailyTransferUsage(makeContext());
    const summary = result.displayData?.summary ?? "";
    expect(summary).toContain("3 transfers");
  });

  it("metadata.amount equals remaining daily amount", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        getDailyDebitUsage: async () => ({ total: 400, count: 2 })
      }
    });

    const result = await getDailyTransferUsage(makeContext());
    const data = result.data as { remainingToday: number };
    expect(result.displayData?.metadata?.amount).toBe(data.remainingToday);
  });
});
