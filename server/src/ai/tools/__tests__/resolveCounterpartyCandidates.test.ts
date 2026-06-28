import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { resolveCounterpartyCandidates } from "../resolveCounterpartyCandidates.js";
import type { ToolContext } from "../../state.js";
import type { TransactionRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    counterpartyMemory: { turn: 1, mentionedCounterparties: [] },
    ...extra
  };
}

function makeTx(email: string): TransactionRecord {
  return {
    id: `tx-${email}`,
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

function makeRepos(transactions: TransactionRecord[]) {
  const base = createMongoRepositories();
  return {
    ...base,
    transactions: {
      ...base.transactions,
      recentForOwner: async () => transactions
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

describe("resolveCounterpartyCandidates - no history", () => {
  it("returns empty/unresolved when no transactions and no memory", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolveCounterpartyCandidates(makeContext("show transactions with Alice"));
    expect(result.status).toBe("empty");
    const data = result.data as { status: string };
    expect(data.status).toBe("unresolved");
  });
});

describe("resolveCounterpartyCandidates - exact email match", () => {
  it("resolves to exact email match with high confidence", async () => {
    setRepositories(makeRepos([makeTx("alice@example.com")]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolveCounterpartyCandidates(
      makeContext("transactions with alice@example.com", {
        requestSlots: {
          intent: "counterparty_lookup",
          counterparty: { explicitEmail: "alice@example.com" }
        }
      })
    );
    expect(result.status).toBe("ok");
    const data = result.data as { status: string; counterparty?: { email: string } };
    expect(data.status).toBe("resolved");
    expect(data.counterparty?.email).toBe("alice@example.com");
  });
});

describe("resolveCounterpartyCandidates - no candidates match query", () => {
  it("returns empty/unresolved when no candidates match", async () => {
    setRepositories(makeRepos([makeTx("alice@example.com")]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolveCounterpartyCandidates(makeContext("transactions with Zzz"));
    expect(result.status).toBe("empty");
    const data = result.data as { status: string };
    expect(data.status).toBe("unresolved");
  });
});

describe("resolveCounterpartyCandidates - last counterparty reference", () => {
  it("resolves from memory when message is a pronoun reference (him)", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const ctx = makeContext("send him 50 ILS", {
      counterpartyMemory: {
        turn: 2,
        mentionedCounterparties: [],
        lastCounterparty: {
          email: "bob@example.com",
          maskedLabel: "b***@example.com",
          userLabel: "Bob",
          displayName: "Bob",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      }
    });
    const result = await resolveCounterpartyCandidates(ctx);
    expect(result.status).toBe("ok");
    const data = result.data as { status: string; counterparty?: { email: string } };
    expect(data.status).toBe("resolved");
    expect(data.counterparty?.email).toBe("bob@example.com");
  });

  it("resolves from memory for 'she' pronoun", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const ctx = makeContext("send her the money", {
      counterpartyMemory: {
        turn: 2,
        mentionedCounterparties: [],
        lastCounterparty: {
          email: "carol@example.com",
          maskedLabel: "c***@example.com",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1
        }
      }
    });
    const result = await resolveCounterpartyCandidates(ctx);
    const data = result.data as { status: string; counterparty?: { email: string } };
    expect(data.status).toBe("resolved");
    expect(data.counterparty?.email).toBe("carol@example.com");
  });
});

describe("resolveCounterpartyCandidates - metadata on resolved", () => {
  it("resolved result has counterpartyEmail in metadata", async () => {
    setRepositories(makeRepos([makeTx("david@example.com")]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolveCounterpartyCandidates(
      makeContext("transactions with david@example.com", {
        requestSlots: {
          intent: "counterparty_lookup",
          counterparty: { explicitEmail: "david@example.com" }
        }
      })
    );
    const meta = (result.displayData as { metadata: { counterpartyEmail?: string } }).metadata;
    expect(meta.counterpartyEmail).toBe("david@example.com");
  });
});

describe("resolveCounterpartyCandidates - result shape", () => {
  it("result data has kind=counterparty for any outcome", async () => {
    setRepositories(makeRepos([makeTx("someone@example.com")]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolveCounterpartyCandidates(makeContext("transactions with someone"));
    const data = result.data as { kind: string };
    expect(data.kind).toBe("counterparty");
  });

  it("resolved counterparty has maskedLabel in data", async () => {
    setRepositories(makeRepos([makeTx("eve@example.com")]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolveCounterpartyCandidates(
      makeContext("transactions with eve@example.com", {
        requestSlots: {
          intent: "counterparty_lookup",
          counterparty: { explicitEmail: "eve@example.com" }
        }
      })
    );
    const data = result.data as { counterparty?: { maskedLabel: string } };
    expect(data.counterparty?.maskedLabel).toBe("e***@example.com");
  });
});
