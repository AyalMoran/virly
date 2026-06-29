import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { getTransactionsWithCounterparty } from "../getTransactionsWithCounterparty.js";
import type { ToolContext } from "../../state.js";
import type { TransactionRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message: "show transactions with alice",
    ...extra
  };
}

function makeTxRecord(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: "tx1",
    ownerId: "user1",
    counterpartyEmail: "alice@example.com",
    amount: 100,
    type: "debit",
    directionLabel: "sent",
    reason: null,
    createdAt: new Date("2024-01-15T12:00:00.000Z"),
    updatedAt: new Date("2024-01-15T12:00:00.000Z"),
    ...overrides
  };
}

function makeRepos(transactions: TransactionRecord[]) {
  const base = createMongoRepositories();
  return {
    ...base,
    users: {
      ...base.users,
      findByEmails: async () => []
    },
    personalDetails: {
      ...base.personalDetails,
      findProvidedByUserIds: async () => []
    },
    transactions: {
      ...base.transactions,
      recentWithCounterparty: async () => transactions
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearRepositories();
});

describe("getTransactionsWithCounterparty - no counterparty in context", () => {
  it("returns empty status with guidance message", async () => {
    const ctx = makeContext(); // no resolvedCounterparty
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    expect(result.status).toBe("empty");
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/specific recipient/i);
  });
});

describe("getTransactionsWithCounterparty - counterparty set, no transactions", () => {
  it("returns empty status mentioning counterparty", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        userLabel: "Alice",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    expect(result.status).toBe("empty");
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(0);
  });
});

describe("getTransactionsWithCounterparty - transactions found", () => {
  it("returns ok status with correct record count", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        userLabel: "Alice",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    const txs = [makeTxRecord({ id: "tx1" }), makeTxRecord({ id: "tx2" })];
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    expect(result.status).toBe("ok");
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(2);
  });

  it("data contains summaries with correct direction for debit", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    setRepositories(makeRepos([makeTxRecord({ type: "debit", amount: 50 })]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    const summaries = result.data as Array<{ direction: string; amount: number }>;
    expect(summaries[0].direction).toBe("sent");
    expect(summaries[0].amount).toBe(50);
  });

  it("data contains summaries with correct direction for credit", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    setRepositories(makeRepos([makeTxRecord({ type: "credit", amount: 75 })]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    const summaries = result.data as Array<{ direction: string; amount: number }>;
    expect(summaries[0].direction).toBe("received");
    expect(summaries[0].amount).toBe(75);
  });

  it("summary uses maskedLabel for LLM-facing text", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        userLabel: "Alice",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    setRepositories(makeRepos([makeTxRecord()]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    const displayData = result.displayData as { summary: string; userSummary?: string };
    expect(displayData.summary).toContain("a***@example.com");
    expect(displayData.userSummary).toContain("Alice");
  });

  it("includes memoryUpdates with transactions", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    setRepositories(makeRepos([makeTxRecord()]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    expect(result.memoryUpdates?.transactions).toHaveLength(1);
  });

  it("includes reason in row when transaction has one", async () => {
    const ctx = makeContext({
      resolvedCounterparty: {
        email: "alice@example.com",
        maskedLabel: "a***@example.com",
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1
      }
    });
    setRepositories(makeRepos([makeTxRecord({ reason: "dinner" })]) as ReturnType<typeof createMongoRepositories>);
    const result = await getTransactionsWithCounterparty(ctx);
    const summaries = result.data as Array<{ reason: string | null }>;
    expect(summaries[0].reason).toBe("dinner");
  });
});
