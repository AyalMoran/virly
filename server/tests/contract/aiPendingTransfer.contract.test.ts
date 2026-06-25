// server/tests/contract/aiPendingTransfer.contract.test.ts
import assert from "node:assert/strict";
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
    assert.match(created.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(created.userId, USER);
    assert.equal(created.recipientEmail, "dad@example.com");
    assert.equal(created.amount, 123.45);
    assert.equal(created.currency, "ILS");
    assert.equal(created.status, "pending");
    assert.equal(created.version, 1);
    assert.deepEqual(created.idempotencyResults, {});
    assert.ok(created.createdAt instanceof Date);

    const found = await repos.aiPendingTransfers.findById(created.id);
    assert.ok(found);
    assert.equal(found.id, created.id);
    assert.equal(found.amount, 123.45);
    assert.equal(found.reason, "rent");
  },

  "findById returns null for a malformed id": async ({ repos }) => {
    assert.equal(await repos.aiPendingTransfers.findById("not-an-objectid"), null);
  },

  "findById returns null when missing": async ({ repos }) => {
    assert.equal(await repos.aiPendingTransfers.findById("f".repeat(24)), null);
  },

  // ---- findActiveForConversation ----

  "findActiveForConversation returns the active pending doc": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const found = await repos.aiPendingTransfers.findActiveForConversation(USER, CONV);
    assert.ok(found);
    assert.equal(found.id, created.id);
  },

  "findActiveForConversation ignores expired and non-pending docs": async ({ repos }) => {
    await repos.aiPendingTransfers.create(makePending({ expiresAt: past() }));
    assert.equal(await repos.aiPendingTransfers.findActiveForConversation(USER, CONV), null);

    await repos.aiPendingTransfers.create(makePending({ status: "confirmed", expiresAt: future() }));
    assert.equal(await repos.aiPendingTransfers.findActiveForConversation(USER, CONV), null);
  },

  // ---- findActivePendingForUser ----

  "findActivePendingForUser returns null for foreign user / wrong conversation / expired / non-pending": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    // valid
    assert.ok(await repos.aiPendingTransfers.findActivePendingForUser(created.id, USER, CONV));
    // foreign user
    assert.equal(await repos.aiPendingTransfers.findActivePendingForUser(created.id, "b".repeat(24), CONV), null);
    // wrong conversation
    assert.equal(await repos.aiPendingTransfers.findActivePendingForUser(created.id, USER, "conv-999"), null);
    // malformed id
    assert.equal(await repos.aiPendingTransfers.findActivePendingForUser("nope", USER, CONV), null);

    const expired = await repos.aiPendingTransfers.create(makePending({ expiresAt: past() }));
    assert.equal(await repos.aiPendingTransfers.findActivePendingForUser(expired.id, USER, CONV), null);
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
    assert.deepEqual(all.map((r) => r.id), [c.id, b.id, a.id]); // newest-first

    const limited = await repos.aiPendingTransfers.listActivePendingForUser({ userId: USER, limit: 2 });
    assert.equal(limited.length, 2);
    assert.deepEqual(limited.map((r) => r.id), [c.id, b.id]);

    const scoped = await repos.aiPendingTransfers.listActivePendingForUser({ userId: USER, conversationId: "c1", limit: 10 });
    assert.deepEqual(scoped.map((r) => r.id), [b.id, a.id]);
  },

  // ---- updateStatus (conditional) ----

  "updateStatus flips status on the happy path and bumps updatedAt": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed");
    assert.ok(updated);
    assert.equal(updated.status, "confirmed");
    assert.ok(updated.updatedAt >= created.updatedAt);
  },

  "updateStatus returns null and does NOT change status on version mismatch": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ version: 1 }));
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { version: 99 });
    assert.equal(result, null);
    const reread = await repos.aiPendingTransfers.findById(created.id);
    assert.equal(reread?.status, "pending");
  },

  "updateStatus returns null and does NOT change status on expectedStatus mismatch": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ status: "pending" }));
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { expectedStatus: "denied" });
    assert.equal(result, null);
    const reread = await repos.aiPendingTransfers.findById(created.id);
    assert.equal(reread?.status, "pending");
  },

  "updateStatus returns null when notExpired guard fails on an expired doc": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ expiresAt: past() }));
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { notExpired: true });
    assert.equal(result, null);
    const reread = await repos.aiPendingTransfers.findById(created.id);
    assert.equal(reread?.status, "pending");
  },

  "updateStatus returns null for a foreign userId guard": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const result = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", { userId: "b".repeat(24) });
    assert.equal(result, null);
    assert.equal((await repos.aiPendingTransfers.findById(created.id))?.status, "pending");
  },

  "updateStatus sets supersededById alongside the status flip": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const replacement = "c".repeat(24);
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "superseded", { supersededById: replacement });
    assert.ok(updated);
    assert.equal(updated.status, "superseded");
    assert.equal(updated.supersededById, replacement);
  },

  "updateStatus writes an idempotency result that is visible on the returned record": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending());
    const updated = await repos.aiPendingTransfers.updateStatus(created.id, "confirmed", {
      idempotencyKey: "confirm:abc-123",
      idempotencyResult: { transactionId: "t1", ok: true }
    });
    assert.ok(updated);
    assert.equal(updated.status, "confirmed");
    assert.deepEqual(updated.idempotencyResults["confirm:abc-123"], { transactionId: "t1", ok: true });

    const found = await repos.aiPendingTransfers.findById(created.id);
    assert.deepEqual(found?.idempotencyResults["confirm:abc-123"], { transactionId: "t1", ok: true });
  },

  // ---- setIdempotencyResult ----

  "setIdempotencyResult merges a key without clobbering existing keys": async ({ repos }) => {
    const created = await repos.aiPendingTransfers.create(makePending({ idempotencyResults: { existing: 1 } }));
    await repos.aiPendingTransfers.setIdempotencyResult(created.id, "added", { nested: [1, 2, 3] });

    const found = await repos.aiPendingTransfers.findById(created.id);
    assert.ok(found);
    assert.deepEqual(found.idempotencyResults, { existing: 1, added: { nested: [1, 2, 3] } });
  },

  "setIdempotencyResult is a no-op for a malformed id": async ({ repos }) => {
    // Must not throw.
    await repos.aiPendingTransfers.setIdempotencyResult("not-an-id", "k", { v: 1 });
    assert.ok(true);
  },

  // ---- idempotencyResults jsonb round-trip ----

  "idempotencyResults round-trips a nested object exactly": async ({ repos }) => {
    const idempotencyResults = {
      "confirm:1": { transactionId: "tx_1", amount: 50, ok: true },
      "notify:1": { sent: false, attempts: [1, 2] }
    };
    const created = await repos.aiPendingTransfers.create(makePending({ idempotencyResults }));
    assert.deepEqual(created.idempotencyResults, idempotencyResults);

    const found = await repos.aiPendingTransfers.findById(created.id);
    assert.deepEqual(found?.idempotencyResults, idempotencyResults);
  }
});
