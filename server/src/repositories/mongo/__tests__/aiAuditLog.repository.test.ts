
// src/repositories/mongo/aiAuditLog.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { AiAuditLog } from "../../../models/AiAuditLog.js";
import { mongoAiAuditLogRepository } from "../aiAuditLog.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k];
  o[k] = v;
  t.after(() => {
    o[k] = orig;
  });
}

const LOG_OID = "507f1f77bcf86cd799439011";
const USER_OID = "507f191e810c19729de860ea";

const leanLog = {
  _id: LOG_OID,
  userId: USER_OID,
  conversationId: "conv-abc-123",
  requestId: "req-001",
  assistantId: "oshri",
  intent: "balance_inquiry",
  toolsRequested: ["getUserAccounts", "getAccountBalance"],
  toolsExecuted: ["getUserAccounts", "getAccountBalance"],
  refusalReason: null,
  diagnostics: [{ type: "snapshot", nodeName: "start", createdAt: "2026-01-01T00:00:00.000Z" }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

test("create: maps returned doc to AiAuditLogRecord with string id, no _id leaked", async (t) => {
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create,
    t
  );

  const input = {
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: "req-001",
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: ["getUserAccounts", "getAccountBalance"],
    toolsExecuted: ["getUserAccounts", "getAccountBalance"],
    refusalReason: null,
    diagnostics: [{ type: "snapshot", nodeName: "start", createdAt: "2026-01-01T00:00:00.000Z" }]
  };

  const rec = await mongoAiAuditLogRepository.create(input);

  assert.ok(rec);
  assert.equal(rec.id, LOG_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined, "must not expose _id");
  assert.equal(rec.userId, USER_OID);
  assert.equal(rec.conversationId, "conv-abc-123");
  assert.equal(rec.requestId, "req-001");
  assert.equal(rec.assistantId, "oshri");
  assert.equal(rec.intent, "balance_inquiry");
  assert.ok(rec.createdAt instanceof Date);
  assert.ok(rec.updatedAt instanceof Date);
});

test("create: passes all fields to AiAuditLog.create", async (t) => {
  let capturedDocs: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    AiAuditLog,
    "create",
    (async (docs: unknown) => { capturedDocs = docs; return [returnedDoc]; }) as unknown as typeof AiAuditLog.create,
    t
  );

  const input = {
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: "req-001",
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: ["getUserAccounts"],
    toolsExecuted: ["getUserAccounts"],
    refusalReason: null,
    diagnostics: []
  };

  await mongoAiAuditLogRepository.create(input);

  const docs = capturedDocs as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(docs) && docs.length === 1, "should pass array with one item");
  const doc = docs[0];
  assert.equal(doc.userId, USER_OID);
  assert.equal(doc.conversationId, "conv-abc-123");
  assert.equal(doc.requestId, "req-001");
  assert.equal(doc.assistantId, "oshri");
  assert.equal(doc.intent, "balance_inquiry");
  assert.deepEqual(doc.toolsRequested, ["getUserAccounts"]);
  assert.deepEqual(doc.toolsExecuted, ["getUserAccounts"]);
  assert.equal(doc.refusalReason, null);
  assert.deepEqual(doc.diagnostics, []);
});

test("create: passes session when tx context is provided", async (t) => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown, opts: unknown) => { capturedOpts = opts; return [returnedDoc]; }) as unknown as typeof AiAuditLog.create,
    t
  );

  const input = {
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: null,
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: [],
    toolsExecuted: [],
    refusalReason: null,
    diagnostics: []
  };

  await mongoAiAuditLogRepository.create(input, fakeSession);

  assert.equal((capturedOpts as Record<string, unknown>).session, fakeSession);
});

test("create: toolsRequested array passes through unchanged", async (t) => {
  const specialTools = ["getUserAccounts", "getAccountBalance", "getRecentTransactions"];
  const logWithTools = { ...leanLog, toolsRequested: specialTools };
  const returnedDoc = { ...logWithTools, toObject: () => logWithTools };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create,
    t
  );

  const rec = await mongoAiAuditLogRepository.create({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: null,
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: specialTools,
    toolsExecuted: [],
    refusalReason: null,
    diagnostics: []
  });

  assert.deepEqual(rec.toolsRequested, specialTools);
});

test("create: toolsExecuted array passes through unchanged", async (t) => {
  const specialTools = ["getUserAccounts", "searchTransactions"];
  const logWithTools = { ...leanLog, toolsExecuted: specialTools };
  const returnedDoc = { ...logWithTools, toObject: () => logWithTools };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create,
    t
  );

  const rec = await mongoAiAuditLogRepository.create({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: null,
    assistantId: "oshri",
    intent: "transaction_search",
    toolsRequested: specialTools,
    toolsExecuted: specialTools,
    refusalReason: null,
    diagnostics: []
  });

  assert.deepEqual(rec.toolsExecuted, specialTools);
});

test("create: diagnostics array passes through unchanged", async (t) => {
  const specialDiagnostics = [
    { type: "failure", nodeName: "classifier", createdAt: "2026-01-01T00:00:00.000Z", failureClass: "classifier_failed" },
    { type: "snapshot", nodeName: "end", createdAt: "2026-01-01T00:00:01.000Z" }
  ];
  const logWithDiag = { ...leanLog, diagnostics: specialDiagnostics };
  const returnedDoc = { ...logWithDiag, toObject: () => logWithDiag };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create,
    t
  );

  const rec = await mongoAiAuditLogRepository.create({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: null,
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: [],
    toolsExecuted: [],
    refusalReason: null,
    diagnostics: specialDiagnostics
  });

  assert.deepEqual(rec.diagnostics, specialDiagnostics);
});

test("create: requestId=null is preserved", async (t) => {
  const logNullReq = { ...leanLog, requestId: null };
  const returnedDoc = { ...logNullReq, toObject: () => logNullReq };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create,
    t
  );

  const rec = await mongoAiAuditLogRepository.create({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: null,
    assistantId: "oshri",
    intent: "balance_inquiry",
    toolsRequested: [],
    toolsExecuted: [],
    refusalReason: null,
    diagnostics: []
  });

  assert.equal(rec.requestId, null);
});

test("create: refusalReason is preserved when set", async (t) => {
  const logWithRefusal = { ...leanLog, refusalReason: "unsafe_request_detected" };
  const returnedDoc = { ...logWithRefusal, toObject: () => logWithRefusal };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create,
    t
  );

  const rec = await mongoAiAuditLogRepository.create({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    requestId: null,
    assistantId: "oshri",
    intent: "unsafe_request",
    toolsRequested: [],
    toolsExecuted: [],
    refusalReason: "unsafe_request_detected",
    diagnostics: []
  });

  assert.equal(rec.refusalReason, "unsafe_request_detected");
});
