import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { getTransactionsWithCounterparty } from "../getTransactionsWithCounterparty.js";
import { buildBlocksFromResult } from "../../v2/blocks.js";
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

let lastCounterpartyLimit: number | undefined;

beforeEach(() => {
  lastCounterpartyLimit = undefined;
});

function makeRepos(all: TransactionRecord[]) {
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
      recentWithCounterparty: async (input: { limit: number }) => {
        lastCounterpartyLimit = input.limit;
        return all.slice(0, input.limit);
      }
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

describe("getTransactionsWithCounterparty - honors the requested count", () => {
  const alice = {
    email: "alice@example.com",
    maskedLabel: "a***@example.com",
    userLabel: "Alice",
    firstMentionedAtTurn: 1,
    lastReferencedAtTurn: 1
  };

  it("requests up to the max and returns all when the user asks for 'all'", async () => {
    const ctx = makeContext({
      message: "show me all transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = Array.from({ length: 12 }, (_, i) => makeTxRecord({ id: `tx${i + 1}` }));
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    const result = await getTransactionsWithCounterparty(ctx);

    expect(lastCounterpartyLimit).toBe(50);
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(12);
  });

  it("defaults to 10 when no count is specified", async () => {
    const ctx = makeContext({
      message: "transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = Array.from({ length: 12 }, (_, i) => makeTxRecord({ id: `tx${i + 1}` }));
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    await getTransactionsWithCounterparty(ctx);

    expect(lastCounterpartyLimit).toBe(10);
  });

  it("honors an explicit smaller number", async () => {
    const ctx = makeContext({
      message: "show me the last 3 transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = Array.from({ length: 12 }, (_, i) => makeTxRecord({ id: `tx${i + 1}` }));
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    await getTransactionsWithCounterparty(ctx);

    expect(lastCounterpartyLimit).toBe(3);
  });
});

describe("getTransactionsWithCounterparty - transaction_list card", () => {
  const alice = {
    email: "alice@example.com",
    maskedLabel: "a***@example.com",
    userLabel: "Alice",
    firstMentionedAtTurn: 1,
    lastReferencedAtTurn: 1
  };

  it("populates metadata.transactions so a transaction_list card renders every row", async () => {
    const ctx = makeContext({
      message: "show me all transactions with alice",
      resolvedCounterparty: alice
    });
    const txs = [
      makeTxRecord({ id: "tx1", type: "debit", amount: 100 }),
      makeTxRecord({ id: "tx2", type: "credit", amount: 75 })
    ];
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);

    const result = await getTransactionsWithCounterparty(ctx);

    const meta = (result.displayData as { metadata: { transactions?: unknown[] } }).metadata;
    expect(meta.transactions).toHaveLength(2);

    const blocks = buildBlocksFromResult("getTransactionsWithCounterparty", result);
    const list = blocks.find((block) => block.type === "transaction_list") as
      | { type: "transaction_list"; summary: { totalCount: number } }
      | undefined;
    expect(list).toBeDefined();
    expect(list?.summary.totalCount).toBe(2);
  });

  it("keeps counterparty emails masked in the card rows", async () => {
    const ctx = makeContext({
      message: "show me all transactions with alice",
      resolvedCounterparty: alice
    });
    setRepositories(makeRepos([makeTxRecord({ id: "tx1" })]) as ReturnType<typeof createMongoRepositories>);

    const result = await getTransactionsWithCounterparty(ctx);
    const meta = (result.displayData as {
      metadata: { transactions?: Array<{ counterpartyLabel?: string }> };
    }).metadata;

    expect(meta.transactions?.[0].counterpartyLabel).toBe("a***@example.com");
    expect(JSON.stringify(meta.transactions)).not.toContain("alice@example.com");
  });
});
