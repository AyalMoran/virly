import { setRepositories, clearRepositories } from "../../../repositories/index.js";
import { createMongoRepositories } from "../../../repositories/mongo/index.js";
import { resolvePendingTransferReference } from "../resolvePendingTransferReference.js";
import type { ToolContext } from "../../state.js";
import type { AiPendingTransferRecord } from "../../../repositories/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePendingRecord(overrides: Partial<AiPendingTransferRecord> = {}): AiPendingTransferRecord {
  return {
    id: "pending1",
    userId: "user1",
    conversationId: "conv1",
    assistantId: "assistant1",
    recipientEmail: "bob@example.com",
    version: 1,
    currency: "ILS",
    recipientFirstName: "Bob",
    recipientLastName: "Smith",
    amount: 150,
    reason: null,
    status: "pending",
    supersededById: null,
    supersedesId: null,
    idempotencyResults: {},
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function makeContext(message: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user1",
    conversationId: "conv1",
    message,
    ...extra
  };
}

function makeRepos(pendingList: AiPendingTransferRecord[]) {
  const base = createMongoRepositories();
  return {
    ...base,
    aiPendingTransfers: {
      ...base.aiPendingTransfers,
      listActivePendingForUser: async () => pendingList
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  clearRepositories();
});

describe("resolvePendingTransferReference - memory pending confirmation", () => {
  it("resolves from memory when pending confirmation is present and not expired", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const ctx = makeContext("yes confirm it", {
      counterpartyMemory: {
        turn: 2,
        mentionedCounterparties: [],
        pendingConfirmation: {
          confirmationId: "conf-123",
          type: "transfer",
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          recipientEmail: "bob@example.com",
          recipientFirstName: "Bob",
          recipientLastName: "Smith",
          amount: 200,
          currency: "ILS",
          reason: null,
          turnCreated: 1,
          version: 1
        }
      }
    });
    const result = await resolvePendingTransferReference(ctx);
    expect(result.status).toBe("ok");
    const data = result.data as { status: string; pendingTransferId: string };
    expect(data.status).toBe("resolved");
    expect(data.pendingTransferId).toBe("conf-123");
  });

  it("does NOT resolve from memory when pending confirmation is expired", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const ctx = makeContext("confirm it", {
      counterpartyMemory: {
        turn: 2,
        mentionedCounterparties: [],
        pendingConfirmation: {
          confirmationId: "conf-expired",
          type: "transfer",
          status: "pending",
          createdAt: new Date(Date.now() - 120000).toISOString(),
          expiresAt: new Date(Date.now() - 60000).toISOString(),
          recipientEmail: "bob@example.com",
          recipientFirstName: null,
          recipientLastName: null,
          amount: 100,
          currency: "ILS",
          reason: null,
          turnCreated: 1,
          version: 1
        }
      }
    });
    const result = await resolvePendingTransferReference(ctx);
    // Falls through to fallbackRows which is empty
    expect(result.status).toBe("empty");
  });
});

describe("resolvePendingTransferReference - no pending transfers", () => {
  it("returns empty when no pending transfers exist", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolvePendingTransferReference(makeContext("confirm my transfer"));
    expect(result.status).toBe("empty");
    const data = result.data as { status: string };
    expect(data.status).toBe("unresolved");
  });
});

describe("resolvePendingTransferReference - single pending transfer", () => {
  it("auto-resolves when there is exactly one pending transfer", async () => {
    setRepositories(makeRepos([makePendingRecord()]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolvePendingTransferReference(makeContext("confirm it"));
    expect(result.status).toBe("ok");
    const data = result.data as { status: string; pendingTransferId: string };
    expect(data.status).toBe("resolved");
    expect(data.pendingTransferId).toBe("pending1");
  });
});

describe("resolvePendingTransferReference - multiple pending transfers", () => {
  it("returns ambiguous when multiple pending transfers and no ordinal", async () => {
    setRepositories(makeRepos([
      makePendingRecord({ id: "p1" }),
      makePendingRecord({ id: "p2" })
    ]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolvePendingTransferReference(makeContext("confirm my transfer"));
    const data = result.data as { status: string };
    expect(data.status).toBe("ambiguous");
  });

  it("resolves by ordinal 'first'", async () => {
    setRepositories(makeRepos([
      makePendingRecord({ id: "p1" }),
      makePendingRecord({ id: "p2" })
    ]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolvePendingTransferReference(makeContext("confirm the first one"));
    const data = result.data as { status: string; pendingTransferId: string };
    expect(data.status).toBe("resolved");
    expect(data.pendingTransferId).toBe("p1");
  });

  it("resolves by ordinal 'second'", async () => {
    setRepositories(makeRepos([
      makePendingRecord({ id: "p1" }),
      makePendingRecord({ id: "p2" })
    ]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolvePendingTransferReference(makeContext("the second transfer"));
    const data = result.data as { status: string; pendingTransferId: string };
    expect(data.status).toBe("resolved");
    expect(data.pendingTransferId).toBe("p2");
  });

  it("returns unresolved when ordinal is out of range", async () => {
    setRepositories(makeRepos([
      makePendingRecord({ id: "p1" })
    ]) as ReturnType<typeof createMongoRepositories>);
    const result = await resolvePendingTransferReference(makeContext("confirm the third one"));
    const data = result.data as { status: string };
    expect(data.status).toBe("unresolved");
  });
});

describe("resolvePendingTransferReference - clarification options", () => {
  it("uses clarification options when expectedReplyType is pending_transfer", async () => {
    setRepositories(makeRepos([]) as ReturnType<typeof createMongoRepositories>);
    const ctx = makeContext("the first one", {
      clarification: {
        reason: "ambiguous_pending_transfer",
        message: "Which transfer?",
        expectedReplyType: "pending_transfer",
        options: [
          { id: "clar-p1", label: "150.00 ILS to Bob", value: "clar-p1" },
          { id: "clar-p2", label: "200.00 ILS to Alice", value: "clar-p2" }
        ]
      }
    });
    const result = await resolvePendingTransferReference(ctx);
    const data = result.data as { status: string; pendingTransferId: string };
    expect(data.status).toBe("resolved");
    expect(data.pendingTransferId).toBe("clar-p1");
  });
});
