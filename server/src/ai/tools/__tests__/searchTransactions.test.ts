import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { searchTransactions } from "../searchTransactions.js";
import type { ToolContext } from "../../state.js";
import type { TransactionRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FilteredCall = { ownerId: string; sort?: string; counterpartyEmail?: string };

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    ...extra
  };
}

function makeTx(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
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

function makeRepos(transactions: TransactionRecord[], capturedCalls?: FilteredCall[]) {
  const base = createMongoRepositories();
  return {
    ...base,
    transactions: {
      ...base.transactions,
      listForOwnerFiltered: async (criteria: FilteredCall) => {
        if (capturedCalls) capturedCalls.push(criteria);
        return transactions;
      }
    },
    users: {
      ...base.users,
      findByEmails: async () => []
    },
    personalDetails: {
      ...base.personalDetails,
      findProvidedByUserIds: async () => []
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearRepositories();
});

describe("searchTransactions - no results", () => {
  it("returns empty status when no transactions match", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("sent transactions last month"));
    expect(result.status).toBe("empty");
    expect(result.toolName).toBe("searchTransactions");
  });

  it("summary says no transactions found", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show all transfers"));
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/no transactions/i);
  });

  it("recordCount is 0 for empty results", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("search transactions"));
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(0);
  });
});

describe("searchTransactions - results found", () => {
  it("returns ok status when transactions match", async () => {
    setRepositories(makeRepos([makeTx()]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show sent transactions"));
    expect(result.status).toBe("ok");
  });

  it("data contains array of transaction rows", async () => {
    setRepositories(makeRepos([makeTx({ id: "tx-abc" })]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show transactions"));
    const data = result.data as Array<{ transactionId: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].transactionId).toBe("tx-abc");
  });

  it("recordCount matches number of returned rows", async () => {
    const txs = [makeTx({ id: "tx1" }), makeTx({ id: "tx2" }), makeTx({ id: "tx3" })];
    setRepositories(makeRepos(txs) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("recent transactions"));
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(3);
  });

  it("includes memoryUpdates with transaction entries", async () => {
    setRepositories(makeRepos([makeTx()]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show my transactions"));
    expect(result.memoryUpdates?.transactions).toHaveLength(1);
  });

  it("summary includes direction label for 'sent' filter message", async () => {
    setRepositories(makeRepos([makeTx({ type: "debit" })]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show sent transactions"));
    const summary = (result.displayData as { summary: string }).summary;
    expect(summary).toMatch(/sent/i);
  });

  it("LLM summary uses masked labels", async () => {
    setRepositories(makeRepos([makeTx({ counterpartyEmail: "alice@example.com" })]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show transactions"));
    const displayData = result.displayData as { summary: string; userSummary?: string };
    expect(displayData.summary).toMatch(/a\*\*\*@example\.com/);
  });

  it("user summary uses plain email when no name on file", async () => {
    setRepositories(makeRepos([makeTx({ counterpartyEmail: "alice@example.com" })]) as ReturnType<typeof createMongoRepositories>);
    const result = await searchTransactions(makeContext("show transactions"));
    const displayData = result.displayData as { userSummary?: string };
    expect(displayData.userSummary).toContain("alice@example.com");
  });
});

describe("searchTransactions - filter criteria", () => {
  it("passes ownerId to repo via filter criteria", async () => {
    const calls: FilteredCall[] = [];
    setRepositories(makeRepos([], calls) as ReturnType<typeof createMongoRepositories>);
    await searchTransactions(makeContext("show transactions"));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].ownerId).toBe("user1");
  });

  it("passes sort=oldest to repo when message says oldest", async () => {
    const calls: FilteredCall[] = [];
    setRepositories(makeRepos([], calls) as ReturnType<typeof createMongoRepositories>);
    await searchTransactions(makeContext("show oldest transactions"));
    expect(calls[0].sort).toBe("oldest");
  });

  it("passes counterpartyEmail to repo when resolvedCounterparty is set", async () => {
    const calls: FilteredCall[] = [];
    setRepositories(makeRepos([], calls) as ReturnType<typeof createMongoRepositories>);
    await searchTransactions(
      makeContext("transactions with alice", {
        resolvedCounterparty: {
          email: "alice@example.com",
          maskedLabel: "a***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      })
    );
    expect(calls[0].counterpartyEmail).toBe("alice@example.com");
  });
});
