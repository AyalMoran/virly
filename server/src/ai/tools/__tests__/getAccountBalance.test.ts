import { getAccountBalance } from "../getAccountBalance.js";
import { withRepos, makeUserRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "What is my balance?",
    ...overrides
  };
}

describe("getAccountBalance", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns ok result with user balance when user exists (balance 500)", async () => {
    const user = makeUserRecord({ balance: 500 });
    cleanup = withRepos({
      users: {
        ...({} as any),
        findById: async () => user
      }
    });

    const result = await getAccountBalance(makeContext());
    expect(result.status).toBe("ok");
    expect(result.toolName).toBe("getAccountBalance");
    const data = result.data as { balance: number };
    expect(data.balance).toBe(500);
    expect(result.displayData?.summary).toContain("500.00");
  });

  it("returns ok result with user balance when balance is 0", async () => {
    const user = makeUserRecord({ balance: 0 });
    cleanup = withRepos({
      users: {
        ...({} as any),
        findById: async () => user
      }
    });

    const result = await getAccountBalance(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as { balance: number };
    expect(data.balance).toBe(0);
    expect(result.displayData?.summary).toContain("0.00");
  });

  it("includes metadata.amount equal to the balance", async () => {
    const user = makeUserRecord({ balance: 123.45 });
    cleanup = withRepos({
      users: {
        ...({} as any),
        findById: async () => user
      }
    });

    const result = await getAccountBalance(makeContext());
    expect(result.displayData?.metadata?.amount).toBe(123.45);
  });

  it("throws with status 404 when user is not found", async () => {
    cleanup = withRepos({
      users: {
        ...({} as any),
        findById: async () => null
      }
    });

    await expect(getAccountBalance(makeContext())).rejects.toMatchObject({
      status: 404,
      message: "Authenticated account not found."
    });
  });
});
