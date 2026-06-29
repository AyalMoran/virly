import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { getVerifiedRecipients } from "../getVerifiedRecipients.js";
import type { ToolContext } from "../../state.js";
import type { TransactionRecord, UserRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message: "who can I send to?"
  };
}

function makeTx(email: string): TransactionRecord {
  return {
    id: "tx1",
    ownerId: "user1",
    counterpartyEmail: email,
    amount: 100,
    type: "debit",
    directionLabel: "sent",
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function makeUser(email: string, isVerified: boolean): UserRecord {
  return {
    id: `id-${email}`,
    email,
    passwordHash: "hash",
    phone: "+972501234567",
    isVerified,
    personalDetails: null,
    balance: 0,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function makeRepos(opts: {
  transactions: TransactionRecord[];
  users: UserRecord[];
}) {
  const base = createMongoRepositories();
  return {
    ...base,
    transactions: {
      ...base.transactions,
      recentForOwner: async () => opts.transactions
    },
    users: {
      ...base.users,
      findByEmails: async () => opts.users
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

describe("getVerifiedRecipients - no transactions", () => {
  it("returns empty status when there are no recent transactions", async () => {
    setRepositories(makeRepos({ transactions: [], users: [] }) as ReturnType<typeof createMongoRepositories>);
    const result = await getVerifiedRecipients(makeContext());
    expect(result.status).toBe("empty");
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(0);
  });
});

describe("getVerifiedRecipients - no verified users", () => {
  it("returns empty when counterparties are unverified", async () => {
    setRepositories(makeRepos({
      transactions: [makeTx("bob@example.com")],
      users: [makeUser("bob@example.com", false)]
    }) as ReturnType<typeof createMongoRepositories>);
    const result = await getVerifiedRecipients(makeContext());
    expect(result.status).toBe("empty");
  });
});

describe("getVerifiedRecipients - verified recipients found", () => {
  it("returns ok status when verified recipients exist", async () => {
    setRepositories(makeRepos({
      transactions: [makeTx("alice@example.com"), makeTx("bob@example.com")],
      users: [
        makeUser("alice@example.com", true),
        makeUser("bob@example.com", false) // unverified
      ]
    }) as ReturnType<typeof createMongoRepositories>);
    const result = await getVerifiedRecipients(makeContext());
    expect(result.status).toBe("ok");
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    // only alice is verified
    expect(meta.recordCount).toBe(1);
  });

  it("data is array of user labels", async () => {
    setRepositories(makeRepos({
      transactions: [makeTx("alice@example.com")],
      users: [makeUser("alice@example.com", true)]
    }) as ReturnType<typeof createMongoRepositories>);
    const result = await getVerifiedRecipients(makeContext());
    const data = result.data as string[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
  });

  it("deduplicates repeated counterparty emails", async () => {
    setRepositories(makeRepos({
      transactions: [makeTx("alice@example.com"), makeTx("alice@example.com")],
      users: [makeUser("alice@example.com", true)]
    }) as ReturnType<typeof createMongoRepositories>);
    const result = await getVerifiedRecipients(makeContext());
    const meta = (result.displayData as { metadata: { recordCount: number } }).metadata;
    expect(meta.recordCount).toBe(1);
  });

  it("summary uses masked labels for LLM and user labels for user", async () => {
    setRepositories(makeRepos({
      transactions: [makeTx("alice@example.com")],
      users: [makeUser("alice@example.com", true)]
    }) as ReturnType<typeof createMongoRepositories>);
    const result = await getVerifiedRecipients(makeContext());
    const displayData = result.displayData as { summary: string; userSummary?: string };
    // LLM summary should mask the email
    expect(displayData.summary).toMatch(/a\*\*\*@example\.com/);
    // User summary should show the full email (no name on file)
    expect(displayData.userSummary).toContain("alice@example.com");
  });
});
