
// src/repositories/mongo/aiPendingTransfer.repository.test.ts
import { AiPendingTransfer } from "../../../models/AiPendingTransfer.js";
import { mongoAiPendingTransferRepository } from "../aiPendingTransfer.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k];
  o[k] = v;
  cleanups.push(() => { o[k] = orig; });
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

test("findById: maps lean doc to record with string id, no _id leaked", async () => {
  const chain = { session: () => chain, lean: async () => leanApt };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findById(APT_OID);

  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(APT_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec!.userId).toBe(USER_OID);
  expect(rec!.amount).toBe(100);
  expect(typeof rec!.amount).toBe("number");
  expect(rec!.currency).toBe("ILS");
});

test("findById: queries by _id", async () => {
  let captured: unknown;
  const chain = { session: () => chain, lean: async () => null };
  patch(
    AiPendingTransfer,
    "findOne",
    ((f: unknown) => { captured = f; return chain; }) as unknown as typeof AiPendingTransfer.findOne
  );

  await mongoAiPendingTransferRepository.findById(APT_OID);
  expect(captured).toStrictEqual({ _id: APT_OID });
});

test("findById: returns null for malformed id without touching the model", async () => {
  let called = false;
  patch(
    AiPendingTransfer,
    "findOne",
    (() => { called = true; return { session: () => ({}), lean: async () => null }; }) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findById("not-an-oid");
  expect(rec).toBeNull();
  expect(called).toBe(false);
});

test("findById: converts a Map idempotencyResults into a plain object", async () => {
  const withMap = {
    ...leanApt,
    idempotencyResults: new Map([["key-1", { status: "denied", message: "x" }]])
  };
  const chain = { session: () => chain, lean: async () => withMap };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findById(APT_OID);
  expect(rec).toBeTruthy();
  expect(rec!.idempotencyResults instanceof Map).toBe(false);
  expect(rec!.idempotencyResults).toStrictEqual({ "key-1": { status: "denied", message: "x" } });
});

test("findById: stringifies supersededById/supersedesId ObjectIds", async () => {
  const withRefs = {
    ...leanApt,
    supersededById: { toString: () => SUPERSEDED_OID },
    supersedesId: { toString: () => SUPERSEDED_OID }
  };
  const chain = { session: () => chain, lean: async () => withRefs };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findById(APT_OID);
  expect(rec).toBeTruthy();
  expect(rec!.supersededById).toBe(SUPERSEDED_OID);
  expect(rec!.supersedesId).toBe(SUPERSEDED_OID);
});

test("findById: passes session when tx is provided", async () => {
  let captured: unknown;
  const session = { id: "s1" };
  const chain = {
    session(s: unknown) { captured = s; return chain; },
    lean: async () => leanApt
  };
  patch(
    AiPendingTransfer,
    "findOne",
    ((_f: unknown) => chain) as unknown as typeof AiPendingTransfer.findOne
  );

  await mongoAiPendingTransferRepository.findById(APT_OID, session);
  expect(captured).toBe(session);
});

// ---------------------------------------------------------------------------
// findActiveForConversation
// ---------------------------------------------------------------------------

test("findActiveForConversation: filters by userId/conversationId/pending/not-expired", async () => {
  let captured: Record<string, unknown> = {};
  const chain = { session: () => chain, lean: async () => leanApt };
  patch(
    AiPendingTransfer,
    "findOne",
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findActiveForConversation(USER_OID, "conv-1");
  expect(rec).toBeTruthy();
  expect(captured.userId).toBe(USER_OID);
  expect(captured.conversationId).toBe("conv-1");
  expect(captured.status).toBe("pending");
  expect((captured.expiresAt as { $gt: Date }).$gt).toBeInstanceOf(Date);
});

// ---------------------------------------------------------------------------
// findActivePendingForUser
// ---------------------------------------------------------------------------

test("findActivePendingForUser: filters by _id/userId/conversationId/pending/not-expired", async () => {
  let captured: Record<string, unknown> = {};
  const chain = { session: () => chain, lean: async () => leanApt };
  patch(
    AiPendingTransfer,
    "findOne",
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findActivePendingForUser(APT_OID, USER_OID, "conv-1");
  expect(rec).toBeTruthy();
  expect(captured._id).toBe(APT_OID);
  expect(captured.userId).toBe(USER_OID);
  expect(captured.conversationId).toBe("conv-1");
  expect(captured.status).toBe("pending");
  expect((captured.expiresAt as { $gt: Date }).$gt).toBeInstanceOf(Date);
});

test("findActivePendingForUser: returns null for malformed id", async () => {
  let called = false;
  patch(
    AiPendingTransfer,
    "findOne",
    (() => { called = true; return { session: () => ({}), lean: async () => null }; }) as unknown as typeof AiPendingTransfer.findOne
  );

  const rec = await mongoAiPendingTransferRepository.findActivePendingForUser("bad", USER_OID, "conv-1");
  expect(rec).toBeNull();
  expect(called).toBe(false);
});

// ---------------------------------------------------------------------------
// listActivePendingForUser
// ---------------------------------------------------------------------------

test("listActivePendingForUser: scopes to conversation, sorts newest-first, limits, maps records", async () => {
  let captured: Record<string, unknown> = {};
  let sortSpec: unknown;
  let limitVal: unknown;
  const chain = {
    sort(s: unknown) { sortSpec = s; return chain; },
    limit(n: unknown) { limitVal = n; return chain; },
    session: () => chain,
    lean: async () => [leanApt]
  };
  patch(
    AiPendingTransfer,
    "find",
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof AiPendingTransfer.find
  );

  const recs = await mongoAiPendingTransferRepository.listActivePendingForUser({
    userId: USER_OID,
    conversationId: "conv-1",
    limit: 10
  });

  expect(recs.length).toBe(1);
  expect(recs[0].id).toBe(APT_OID);
  expect((recs[0] as Record<string, unknown>)._id).toBeUndefined();
  expect(captured.userId).toBe(USER_OID);
  expect(captured.conversationId).toBe("conv-1");
  expect(captured.status).toBe("pending");
  expect(sortSpec).toStrictEqual({ createdAt: -1 });
  expect(limitVal).toBe(10);
});

test("listActivePendingForUser: omits conversationId when not supplied (all-user scope)", async () => {
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
    ((f: Record<string, unknown>) => { captured = f; return chain; }) as unknown as typeof AiPendingTransfer.find
  );

  await mongoAiPendingTransferRepository.listActivePendingForUser({ userId: USER_OID, limit: 10 });
  expect("conversationId" in captured).toBe(false);
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

test("create: inserts and returns a record (idempotencyResults plain object)", async () => {
  let capturedDocs: unknown;
  let capturedOpts: unknown;
  patch(
    AiPendingTransfer,
    "create",
    (async (docs: unknown, opts: unknown) => {
      capturedDocs = docs;
      capturedOpts = opts;
      return [{ ...leanApt, toObject: () => leanApt }];
    }) as unknown as typeof AiPendingTransfer.create
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

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(APT_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec.amount).toBe(100);
  expect(Array.isArray(capturedDocs)).toBeTruthy();
  expect((capturedOpts as Record<string, unknown>).ordered).toBe(true);
});

test("create: passes session in options when tx provided", async () => {
  let capturedOpts: Record<string, unknown> = {};
  const session = { id: "s1" };
  patch(
    AiPendingTransfer,
    "create",
    (async (_docs: unknown, opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return [{ ...leanApt, toObject: () => leanApt }];
    }) as unknown as typeof AiPendingTransfer.create
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
  expect(capturedOpts.session).toBe(session);
});

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------

test("updateStatus: applies match guards (userId/version/status/expiry) and $set status", async () => {
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
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus(APT_OID, "denied", {
    userId: USER_OID,
    version: 1,
    expectedStatus: "pending",
    notExpired: true,
    idempotencyKey: "idem-1",
    idempotencyResult: { status: "denied", message: "Transfer cancelled." }
  });

  expect(rec).toBeTruthy();
  expect(rec!.status).toBe("denied");
  expect(capturedFilter._id).toBe(APT_OID);
  expect(capturedFilter.userId).toBe(USER_OID);
  expect(capturedFilter.version).toBe(1);
  expect(capturedFilter.status).toBe("pending");
  expect((capturedFilter.expiresAt as { $gt: Date }).$gt).toBeInstanceOf(Date);
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  expect(set.status).toBe("denied");
  expect(set["idempotencyResults.idem-1"]).toStrictEqual({ status: "denied", message: "Transfer cancelled." });
  expect(capturedOpts.new).toBe(true);
});

test("updateStatus: returns null when no doc matches the guards", async () => {
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async () => null) as unknown as typeof AiPendingTransfer.findOneAndUpdate
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus(APT_OID, "denied", { version: 99 });
  expect(rec).toBeNull();
});

test("updateStatus: returns null for malformed id without touching the model", async () => {
  let called = false;
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async () => { called = true; return null; }) as unknown as typeof AiPendingTransfer.findOneAndUpdate
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus("bad", "denied");
  expect(rec).toBeNull();
  expect(called).toBe(false);
});

test("updateStatus: $sets supersededById alongside the status flip when provided", async () => {
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (_f: unknown, u: Record<string, unknown>) => {
      capturedUpdate = u;
      return { ...leanApt, status: "superseded", toObject: () => ({ ...leanApt, status: "superseded" }) };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate
  );

  const rec = await mongoAiPendingTransferRepository.updateStatus(APT_OID, "superseded", {
    supersededById: SUPERSEDED_OID
  });
  expect(rec).toBeTruthy();
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  expect(set.status).toBe("superseded");
  expect(set.supersededById).toBe(SUPERSEDED_OID);
});

test("updateStatus: omits supersededById $set when not provided", async () => {
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (_f: unknown, u: Record<string, unknown>) => {
      capturedUpdate = u;
      return { ...leanApt, toObject: () => leanApt };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate
  );

  await mongoAiPendingTransferRepository.updateStatus(APT_OID, "confirmed", { version: 1 });
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  expect("supersededById" in set).toBe(false);
});

test("updateStatus: omits idempotency $set when no key provided", async () => {
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "findOneAndUpdate",
    (async (_f: unknown, u: Record<string, unknown>) => {
      capturedUpdate = u;
      return { ...leanApt, toObject: () => leanApt };
    }) as unknown as typeof AiPendingTransfer.findOneAndUpdate
  );

  await mongoAiPendingTransferRepository.updateStatus(APT_OID, "denied", { version: 1 });
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  expect(set.status).toBe("denied");
  const idemKeys = Object.keys(set).filter((k) => k.startsWith("idempotencyResults"));
  expect(idemKeys).toStrictEqual([]);
});

// ---------------------------------------------------------------------------
// setIdempotencyResult
// ---------------------------------------------------------------------------

test("setIdempotencyResult: $set on the dotted idempotency path", async () => {
  let capturedFilter: Record<string, unknown> = {};
  let capturedUpdate: Record<string, unknown> = {};
  patch(
    AiPendingTransfer,
    "updateOne",
    (async (f: Record<string, unknown>, u: Record<string, unknown>) => {
      capturedFilter = f;
      capturedUpdate = u;
      return { acknowledged: true };
    }) as unknown as typeof AiPendingTransfer.updateOne
  );

  await mongoAiPendingTransferRepository.setIdempotencyResult(APT_OID, "idem-1", { status: "confirmed" });
  expect(capturedFilter._id).toBe(APT_OID);
  const set = (capturedUpdate.$set ?? {}) as Record<string, unknown>;
  expect(set["idempotencyResults.idem-1"]).toStrictEqual({ status: "confirmed" });
});
