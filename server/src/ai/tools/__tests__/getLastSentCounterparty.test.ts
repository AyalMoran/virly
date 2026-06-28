import { getLastSentCounterparty } from "../getLastSentCounterparty.js";
import { withRepos, makeTransactionRecord } from "./_repoKit.js";
import type { ToolContext } from "../../state.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Who did I last send money to?",
    ...overrides
  };
}

describe("getLastSentCounterparty", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("returns empty result when no debit transactions exist", async () => {
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        lastForOwner: async () => null
      }
    });

    const result = await getLastSentCounterparty(makeContext());
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("getLastSentCounterparty");
    expect(result.data).toBeNull();
    expect(result.displayData?.summary).toContain("No sent transactions");
  });

  it("returns ok result with counterparty info when a debit exists", async () => {
    const tx = makeTransactionRecord({
      type: "debit",
      counterpartyEmail: "alice@example.com",
      amount: 120
    });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        lastForOwner: async () => tx
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

    const result = await getLastSentCounterparty(makeContext());
    expect(result.status).toBe("ok");
    const data = result.data as {
      email: string;
      maskedLabel: string;
    };
    expect(data.email).toBe("alice@example.com");
    expect(data.maskedLabel).toBe("a***@example.com");
  });

  it("summary mentions the last counterparty's masked label", async () => {
    const tx = makeTransactionRecord({
      type: "debit",
      counterpartyEmail: "carol@test.org",
      amount: 50
    });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        lastForOwner: async () => tx
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

    const result = await getLastSentCounterparty(makeContext());
    expect(result.displayData?.summary).toContain("c***@test.org");
  });

  it("includes memory update with sent_to relation", async () => {
    const tx = makeTransactionRecord({
      type: "debit",
      counterpartyEmail: "dave@example.com",
      amount: 75
    });
    cleanup = withRepos({
      transactions: {
        ...({} as any),
        lastForOwner: async () => tx
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

    const result = await getLastSentCounterparty(makeContext());
    expect(result.memoryUpdates?.counterparties?.[0].relation).toBe("sent_to");
    expect(result.memoryUpdates?.counterparties?.[0].source).toBe("transaction");
  });
});
