
// src/repositories/mongo/aiPendingTransfer.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { AiPendingTransfer } from "../../models/AiPendingTransfer.js";
import { mongoAiPendingTransferRepository } from "./aiPendingTransfer.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k];
  o[k] = v;
  t.after(() => {
    o[k] = orig;
  });
}

const APT_OID = "507f1f77bcf86cd799439011";
const USER_OID = "507f191e810c19729de860ea";
const SUPERSEDED_OID = "507f191e810c19729de860eb";

const leanApt = {
  _id: APT_OID,
  userId: USER_OID,
  conversationId: "conv-1",
  assistantId: "oshri",
  recipientEmail: "alice@example.com",
  version: 1,
  currency: "ILS",
  recipientFirstName: "Alice",
  recipientLastName: "Smith",
  amount: 100,
  reason: "lunch",
  status: "pending",
  supersededById: null,
  supersedesId: null,
  idempotencyResults: {},
  expiresAt: new Date("2026-01-01T00:10:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

test("findById: maps lean doc to record with string id, no _id leaked", async (t) => {
  const chain = { session: () => chain, lean: async () => leanApt };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findById(APT_OID);

  assert.ok(rec);
  assert.equal(rec.id, APT_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined, "must not leak _id");
  assert.equal(rec.userId, USER_OID);
  assert.equal(rec.amount, 100);
  assert.equal(typeof rec.amount, "number");
  assert.equal(rec.currency, "ILS");
});

test("findById: queries by _id", async (t) => {
  let captured: unknown;
  const chain = { session: () => chain, lean: async () => null };
  patch(
    AiPendingTransfer,
    "findOne",
    ((f: unknown) => {
      captured = f;
      return chain;
    }) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  await mongoAiPendingTransferRepository.findById(APT_OID);
  assert.deepEqual(captured, { _id: APT_OID });
});

test("findById: returns null for malformed id without touching the model", async (t) => {
  let called = false;
  patch(
    AiPendingTransfer,
    "findOne",
    (() => {
      called = true;
      return { session: () => ({}), lean: async () => null };
    }) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findById("not-an-oid");
  assert.equal(rec, null);
  assert.equal(called, false, "must short-circuit invalid ids");
});

test("findById: converts a Map idempotencyResults into a plain object", async (t) => {
  const withMap = {
    ...leanApt,
    idempotencyResults: new Map([["key-1", { status: "denied", message: "x" }]])
  };
  const chain = { session: () => chain, lean: async () => withMap };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findById(APT_OID);
  assert.ok(rec);
  assert.equal(rec.idempotencyResults instanceof Map, false, "must not leak a Map");
  assert.deepEqual(rec.idempotencyResults, {
    "key-1": { status: "denied", message: "x" }
  });
});

test("findById: stringifies supersededById/supersedesId ObjectIds", async (t) => {
  const withRefs = {
    ...leanApt,
    supersededById: { toString: () => SUPERSEDED_OID },
    supersedesId: { toString: () => SUPERSEDED_OID }
  };
  const chain = { session: () => chain, lean: async () => withRefs };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findById(APT_OID);
  assert.ok(rec);
  assert.equal(rec.supersededById, SUPERSEDED_OID);
  assert.equal(rec.supersedesId, SUPERSEDED_OID);
});

test("findById: passes session when tx is provided", async (t) => {
  let captured: unknown;
  const session = { id: "s1" };
  const chain = {
    session(s: unknown) {
      captured = s;
      return chain;
    },
    lean: async () => leanApt
  };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  await mongoAiPendingTransferRepository.findById(APT_OID, session);
  assert.equal(captured, session);
});

// ---------------------------------------------------------------------------
// findActiveForConversation
// ---------------------------------------------------------------------------

test("findActiveForConversation: filters by userId/conversationId/pending/not-expired", async (t) => {
  let captured: Record<string, unknown> = {};
  const chain = { session: () => chain, lean: async () => leanApt };
  patch(
    AiPendingTransfer,
    "findOne",
    ((f: Record<string, unknown>) => {
      captured = f;
      return chain;
    }) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findActiveForConversation(USER_OID, "conv-1");
  assert.ok(rec);
  assert.equal(captured.userId, USER_OID);
  assert.equal(captured.conversationId, "conv-1");
  assert.equal(captured.status, "pending");
  assert.ok((captured.expiresAt as { $gt: Date }).$gt instanceof Date);
});

// ---------------------------------------------------------------------------
// findActivePendingForUser
// ---------------------------------------------------------------------------

test("findActivePendingForUser: filters by _id/userId/conversationId/pending/not-expired", async (t) => {
  let captured: Record<string, unknown> = {};
  const chain = { session: () => chain, lean: async () => leanApt };
  patch(
    AiPendingTransfer,
    "findOne",
    ((f: Record<string, unknown>) => {
      captured = f;
      return chain;
    }) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findActivePendingForUser(APT_OID, USER_OID, "conv-1");
  assert.ok(rec);
  assert.equal(captured._id, APT_OID);
  assert.equal(captured.userId, USER_OID);
  assert.equal(captured.conversationId, "conv-1");
  assert.equal(captured.status, "pending");
  assert.ok((captured.expiresAt as { $gt: Date }).$gt instanceof Date);
});

test("findActivePendingForUser: returns null for malformed id", async (t) => {
  let called = false;
  patch(
    AiPendingTransfer,
    "findOne",
    (() => {
      called = true;
      return { session: () => ({}), lean: async () => null };
    }) as unknown as typeof AiPendingTransfer.findOne,
    t
  );

  const rec = await mongoAiPendingTransferRepository.findActivePendingForUser("bad", USER_OID, "conv-1");
  assert.equal(rec, null);
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------
// listActivePendingForUser
// ---------------------------------------------------------------------------

test("listActivePendingForUser: scopes to conversation, sorts newest-first, limits, maps records", async (t) => {
  let captured: Record<string, unknown> = {};
  let sortSpec: unknown;
  let limitVal: unknown;
  const chain = {
    sort(s: unknown) {
      sortSpec = s;
      return chain;
    },
    limit(n: unknown) {
      limitVal = n;
      return chain;
    },
    session: () => chain,
    lean: async () => [leanApt]
  };
  patch(
    AiPendingTransfer,
    "find",
    ((f: Record<string, unknown>) => {
      captured = f;
      return chain;
    }) as unknown as typeof AiPendingTransfer.find,
    t
  );

  const recs = await mongoAiPendingTransferRepository.listActivePendingForUser({
    userId: USER_OID,
    conversationId: "conv-1",
    limit: 10
  });

  assert.equal(recs.length, 1);
  assert.equal(recs[0].id, APT_OID);
  assert.equal((recs[0] as Record<string, unknown>)._id, undefined);
  assert.equal(captured.userId, USER_OID);
  assert.equal(captured.conversationId, "conv-1");
  assert.equal(captured.status, "pending");
  assert.deepEqual(sortSpec, { createdAt: -1 });
  assert.equal(limitVal, 10);
});

test("listActivePendingForUser: omits conversationId when not supplied (all-user scope)", async (t) => {
  let captured: Record<string, unknown> = {};
  const chain = {
    sort: () => chain,
    limit: () => chain,
    session: () => chain,
    lean: async () => []
  };
  patch(
    AiPendingTransfer,
    "find",
    ((f: Record<string, unknown>) => {
      captured = f;
      return chain;
    }) as unknown as typeof AiPendingTransfer.find,
    t
  );

  await mongoAiPendingTransferRepository.listActivePendingForUser({ userId: USER_OID, limit: 10 });
  assert.equal("conversationId" in captured, false, "must not constrain conversationId");
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

test("create: inserts and returns a record (idempotencyResults plain object)", async (t) => {
  let capturedDocs: unknown;
  let capturedOpts: unknown;
  patch(
    AiPendingTransfer,
    "create",
    (async (docs: unknown, opts: unknown) => {
      capturedDocs = docs;
      capturedOpts = opts;
      return [{ ...leanApt, toObject: () => leanApt }];
    }) as unknown as typeof AiPendingTransfer.create,
    t
  );

  const rec = await mongoAiPendingTransferRepository.create({
    userId: USER_OID,
    conversationId: "conv-1",
    assistantId: "oshri",
    recipientEmail: "alice@example.com",
    version: 1,
    currency: "ILS",
    recipientFirstName: "Alice",
    recipientLastName: "Smith",
    amount: 100,
    reason: "lunch",
    status: "pending",
    supersededById: null,
    supersedesId: null,
    idempotencyResults: {},
    expiresAt: leanApt.expiresAt
  });

  assert.ok(rec);
  assert.equal(rec.id, APT_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined);
  assert.equal(rec.amount, 100);
  assert.ok(Array.isArray(capturedDocs), "create receives an array (ordered insert)");
  assert.equal((capturedOpts as Record<string, unknown>).ordered, true);
});

test("create: passes session in options when tx provided", async (t) => {
  let capturedOpts: Record<string, unknown> = {};
  const session = { id: "s1" };
  patch(
    AiPendingTransfer,
    "create",
    (async (_docs: unknown, opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return [{ ...leanApt, toObject: () => leanApt }];
    }) as unknown as typeof AiPendingTransfer.create,
    t
  );

  await mongoAiPendingTransferRepository.create(
    {
      userId: USER_OID,
      conversationId: "conv-1",
      assistantId: "oshri",
      recipientEmail: "alice@example.com",
      version: 1,
      currency: "ILS",
      recipientFirstName: null,
      recipientLastName: null,
      amount: 50,
      reason: null,
      status: "pending",
      supersededById: null,
      supersedesId: null,
      idempotencyResults: {},
      expiresAt: leanApt.expiresAt
    },
    session
  );
  assert.equal(capturedOpts.session, session);
});

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------

test("updateStatus: applies match guards (userId/version/status/expiry) and $set status", async (t) => {
  let capturedFilter: Record<string, unknown> = {};
  let capturedUpdate: Record<string, unknown> = {};
  let capturedOpts: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (f: Record<string, unknown>, u: Record<string, unknown>, o: Record<string, unknown>) => {
      capturedFilter = f;
      capturedUpdate = u;
      capturedOpts = o;
      return { ...leanApt, status: "denied", toObject: () => ({ ...leanApt, status: "denied" }) };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate,
    t
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus(APT_OID, "denied", {
    userId: USER_OID,
    version: 1,
    expectedStatus: "pending",
    notExpired: true,
    idempotencyKey: "idem-1",
    idempotencyResult: { status: "denied", message: "Transfer cancelled." }
  });

  assert.ok(rec);
  assert.equal(rec.status, "denied");
  assert.equal(capturedFilter._id, APT_OID);
  assert.equal(capturedFilter.userId, USER_OID);
  assert.equal(capturedFilter.version, 1);
  assert.equal(capturedFilter.status, "pending");
  assert.ok((capturedFilter.expiresAt as { $gt: Date }).$gt instanceof Date);
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  assert.equal(set.status, "denied");
  assert.deepEqual(set["idempotencyResults.idem-1"], {
    status: "denied",
    message: "Transfer cancelled."
  });
  assert.equal(capturedOpts.new, true);
});

test("updateStatus: returns null when no doc matches the guards", async (t) => {
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async () => null) as unknown as typeof AiPendingTransfer.findOneAndUpdate,
    t
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus(APT_OID, "denied", {
    version: 99
  });
  assert.equal(rec, null);
});

test("updateStatus: returns null for malformed id without touching the model", async (t) => {
  let called = false;
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async () => {
      called = true;
      return null;
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate,
    t
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus("bad", "denied");
  assert.equal(rec, null);
  assert.equal(called, false);
});

test("updateStatus: $sets supersededById alongside the status flip when provided", async (t) => {
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (_f: unknown, u: Record<string, unknown>) => {
      capturedUpdate = u;
      return { ...leanApt, status: "superseded", toObject: () => ({ ...leanApt, status: "superseded" }) };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate,
    t
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus(APT_OID, "superseded", {
    supersededById: SUPERSEDED_OID
  });
  assert.ok(rec);
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  assert.equal(set.status, "superseded");
  assert.equal(set.supersededById, SUPERSEDED_OID);
});

test("updateStatus: omits supersededById $set when not provided", async (t) => {
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (_f: unknown, u: Record<string, unknown>) => {
      capturedUpdate = u;
      return { ...leanApt, toObject: () => leanApt };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate,
    t
  );

  await mongoAiPendingTransferRepository.updateStatus(APT_OID, "confirmed", { version: 1 });
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  assert.equal("supersededById" in set, false, "must not touch supersededById unless asked");
});

test("updateStatus: omits idempotency $set when no key provided", async (t) => {
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (_f: unknown, u: Record<string, unknown>) => {
      capturedUpdate = u;
      return { ...leanApt, toObject: () => leanApt };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate,
    t
  );

  await mongoAiPendingTransferRepository.updateStatus(APT_OID, "denied", { version: 1 });
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  assert.equal(set.status, "denied");
  const idemKeys = Object.keys(set).filter((k) => k.startsWith("idempotencyResults"));
  assert.deepEqual(idemKeys, []);
});

// ---------------------------------------------------------------------------
// setIdempotencyResult
// ---------------------------------------------------------------------------

test("setIdempotencyResult: $set on the dotted idempotency path", async (t) => {
  let capturedFilter: Record<string, unknown> = {};
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "updateOne",
    (async (f: Record<string, unknown>, u: Record<string, unknown>) => {
      capturedFilter = f;
      capturedUpdate = u;
      return { acknowledged: true };
    }) as unknown as typeof AiPendingTransfer.updateOne,
    t
  );

  await mongoAiPendingTransferRepository.setIdempotencyResult(APT_OID, "idem-1", {
    status: "confirmed"
  });
  assert.equal(capturedFilter._id, APT_OID);
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  assert.deepEqual(set["idempotencyResults.idem-1"], { status: "confirmed" });
});
