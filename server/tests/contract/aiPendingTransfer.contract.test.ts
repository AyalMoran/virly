// server/tests/contract/aiPendingTransfer.contract.test.ts
import { describeContract } from "./harness.js";
import type { AiPendingTransferRecord } from "../../src/repositories/types.js";

const USER = "a".repeat(24);
const CONV = "conv-001";

function future(msFromNow = 60_000): Date {
  return new Date(Date.now() + msFromNow);
}
function past(msAgo = 60_000): Date {
  return new Date(Date.now() - msAgo);
}

function makePending(
  overrides: Partial<Omit<AiPendingTransferRecord, "id" | "createdAt" | "updatedAt">> = {}
): Omit<AiPendingTransferRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: USER,
    conversationId: CONV,
    assistantId: "oshri",
    recipientEmail: "dad@example.com",
    version: 1,
    currency: "ILS",
    recipientFirstName: "Dad",
    recipientLastName: null,
    amount: 50,
    reason: "groceries",
    status: "pending",
    supersededById: null,
    supersedesId: null,
    idempotencyResults: {},
    expiresAt: future(),
    ...overrides
  };
}

describeContract("AiPendingTransferRepository", {
  // ---- create + findById ----

  "create then findById round-trips all fields with a 24-hex id": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ amount: 123.45, reason: "rent" }));
    expect(created.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(created.userId).toBe(USER);
    expect(created.recipientEmail).toBe("dad@example.com");
    expect(created.amount).toBe(123.45);
    expect(created.currency).toBe("ILS");
    expect(created.status).toBe("pending");
    expect(created.version).toBe(1);
    expect(created.idempotencyResults).toStrictEqual({});
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await repos.aiPendingTransfers.findById(created.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
    expect(found!.amount).toBe(123.45);
    expect(found!.reason).toBe("rent");
  },

  "findById returns null for a malformed id": async ({ repos }) => {
    expect(await repos.aiPendingTransfers.findById("not-an-objectid")).toBeNull();
  },

  "findById returns null when missing": async ({ repos }) => {
    expect(await repos.aiPendingTransfers.findById("f".repeat(24))).toBeNull();
  },

  // ---- findActiveForConversation ----

  "findActiveForConversation returns the active pending doc": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const found = await repos.aiPendingTransfers.findActiveForConversation(USER, CONV);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
  },

  "findActiveForConversation ignores expired and non-pending docs": async ({ repos }) => {
    await repos.aiPendingTransfers.create(makePending({ expiresAt: past() }));
    expect(await repos.aiPendingTransfers.findActiveForConversation(USER, CONV)).toBeNull();

    await repos.aiPendingTransfers.create(makePending({ status: "confirmed", expiresAt: future() }));
    expect(await repos.aiPendingTransfers.findActiveForConversation(USER, CONV)).toBeNull();
  },

  // ---- findActivePendingForUser ----

  "findActivePendingForUser returns null for foreign user / wrong conversation / expired / non-pending": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    // valid
    expect(await repos.aiPendingTransfers.findActivePendingForUser(created.id, USER, CONV)).toBeTruthy();
    // foreign user
    expect(await repos.aiPendingTransfers.findActivePendingForUser(created.id, "b".repeat(24), CONV)).toBeNull();
    // wrong conversation
    expect(await repos.aiPendingTransfers.findActivePendingForUser(created.id, USER, "conv-999")).toBeNull();
    // malformed id
    expect(await repos.aiPendingTransfers.findActivePendingForUser("nope", USER, CONV)).toBeNull();

    const expired = await repos.aiPendingTransfers.create(makePending({ expiresAt: past() }));
    expect(await repos.aiPendingTransfers.findActivePendingForUser(expired.id, USER, CONV)).toBeNull();
  },

  // ---- listActivePendingForUser ----

  "listActivePendingForUser returns active pending newest-first, capped by limit, scoped by conversation": async ({ repos }) => {
    const a = await repos.aiPendingTransfers.create(makePending({ conversationId: "c1", amount: 1 }));
    await new Promise((r) => setTimeout(r, 5));
    const b = await repos.aiPendingTransfers.create(makePending({ conversationId: "c1", amount: 2 }));
    await new Promise((r) => setTimeout(r, 5));
    const c = await repos.aiPendingTransfers.create(makePending({ conversationId: "c2", amount: 3 }));
    // noise: expired + confirmed should be excluded
    await repos.aiPendingTransfers.create(makePending({ conversationId: "c1", expiresAt: past() }));
    await repos.aiPendingTransfers.create(makePending({ conversationId: "c1", status: "denied" }));

    const all = await repos.aiPendingTransfers.listActivePendingForUser({ userId: USER, limit: 10 });
    expect(all.map((r) => r.id)).toStrictEqual([c.id, b.id, a.id]); // newest-first

    const limited = await repos.aiPendingTransfers.listActivePendingForUser({ userId: USER, limit: 2 });
    expect(limited.length).toBe(2);
    expect(limited.map((r) => r.id)).toStrictEqual([c.id, b.id]);

    const scoped = await repos.aiPendingTransfers.listActivePendingForUser({ userId: USER, conversationId: "c1", limit: 10 });
    expect(scoped.map((r) => r.id)).toStrictEqual([b.id, a.id]);
  },

  // ---- updateStatus (conditional) ----

  "updateStatus flips status on the happy path and bumps updatedAt": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed");
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("confirmed");
    expect(updated!.updatedAt >= created.updatedAt).toBeTruthy();
  },

  "updateStatus returns null and does NOT change status on version mismatch": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ version: 1 }));
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { version: 99 });
    expect(result).toBeNull();
    const reread = await repos.aiPendingTransfers.findById(created.id);
    expect(reread?.status).toBe("pending");
  },

  "updateStatus returns null and does NOT change status on expectedStatus mismatch": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ status: "pending" }));
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { expectedStatus: "denied" });
    expect(result).toBeNull();
    const reread = await repos.aiPendingTransfers.findById(created.id);
    expect(reread?.status).toBe("pending");
  },

  "updateStatus returns null when notExpired guard fails on an expired doc": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ expiresAt: past() }));
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { notExpired: true });
    expect(result).toBeNull();
    const reread = await repos.aiPendingTransfers.findById(created.id);
    expect(reread?.status).toBe("pending");
  },

  "updateStatus returns null for a foreign userId guard": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { userId: "b".repeat(24) });
    expect(result).toBeNull();
    expect((await repos.aiPendingTransfers.findById(created.id))?.status).toBe("pending");
  },

  "updateStatus can set the 'held' status (fraud hold)": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "held", {
      expectedStatus: "pending"
    });
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("held");
  },

  "updateStatus sets supersededById alongside the status flip": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const replacement = "c".repeat(24);
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "superseded", { supersededById: replacement });
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("superseded");
    expect(updated!.supersededById).toBe(replacement);
  },

  "updateStatus writes an idempotency result that is visible on the returned record": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", {
      idempotencyKey: "confirm:abc-123",
      idempotencyResult: { transactionId: "t1", ok: true }
    });
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("confirmed");
    expect(updated!.idempotencyResults["confirm:abc-123"]).toStrictEqual({ transactionId: "t1", ok: true });

    const found = await repos.aiPendingTransfers.findById(created.id);
    expect(found?.idempotencyResults["confirm:abc-123"]).toStrictEqual({ transactionId: "t1", ok: true });
  },

  // ---- setIdempotencyResult ----

  "setIdempotencyResult merges a key without clobbering existing keys": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ idempotencyResults: { existing: 1 } }));
    await repos.aiPendingTransfers.setIdempotencyResult(created.id, "added", { nested: [1, 2, 3] });

    const found = await repos.aiPendingTransfers.findById(created.id);
    expect(found).toBeTruthy();
    expect(found!.idempotencyResults).toStrictEqual({ existing: 1, added: { nested: [1, 2, 3] } });
  },

  "setIdempotencyResult is a no-op for a malformed id": async ({ repos }) => {
    // Must not throw.
    await repos.aiPendingTransfers.setIdempotencyResult("not-an-id", "k", { v: 1 });
    expect(true).toBeTruthy();
  },

  // ---- idempotencyResults jsonb round-trip ----

  "idempotencyResults round-trips a nested object exactly": async ({ repos }) => {
    const idempotencyResults = {
      "confirm:1": { transactionId: "tx_1", amount: 50, ok: true },
      "notify:1": { sent: false, attempts: [1, 2] }
    };
    const created = await repos.aiPendingTransfers.create(makePending({ idempotencyResults }));
    expect(created.idempotencyResults).toStrictEqual(idempotencyResults);

    const found = await repos.aiPendingTransfers.findById(created.id);
    expect(found?.idempotencyResults).toStrictEqual(idempotencyResults);
  }
});
