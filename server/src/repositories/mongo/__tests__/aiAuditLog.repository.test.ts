
// src/repositories/mongo/aiAuditLog.repository.test.ts
import { AiAuditLog } from "../../../models/AiAuditLog.js";
import { mongoAiAuditLogRepository } from "../aiAuditLog.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k];
  o[k] = v;
  cleanups.push(() => { o[k] = orig; });
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

test("create: maps returned doc to AiAuditLogRecord with string id, no _id leaked", async () => {
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create
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

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(LOG_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec.userId).toBe(USER_OID);
  expect(rec.conversationId).toBe("conv-abc-123");
  expect(rec.requestId).toBe("req-001");
  expect(rec.assistantId).toBe("oshri");
  expect(rec.intent).toBe("balance_inquiry");
  expect(rec.createdAt).toBeInstanceOf(Date);
  expect(rec.updatedAt).toBeInstanceOf(Date);
});

test("create: passes all fields to AiAuditLog.create", async () => {
  let capturedDocs: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    AiAuditLog,
    "create",
    (async (docs: unknown) => { capturedDocs = docs; return [returnedDoc]; }) as unknown as typeof AiAuditLog.create
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
  expect(Array.isArray(docs) && docs.length === 1).toBeTruthy();
  const doc = docs[0];
  expect(doc.userId).toBe(USER_OID);
  expect(doc.conversationId).toBe("conv-abc-123");
  expect(doc.requestId).toBe("req-001");
  expect(doc.assistantId).toBe("oshri");
  expect(doc.intent).toBe("balance_inquiry");
  expect(doc.toolsRequested).toStrictEqual(["getUserAccounts"]);
  expect(doc.toolsExecuted).toStrictEqual(["getUserAccounts"]);
  expect(doc.refusalReason).toBeNull();
  expect(doc.diagnostics).toStrictEqual([]);
});

test("create: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown, opts: unknown) => { capturedOpts = opts; return [returnedDoc]; }) as unknown as typeof AiAuditLog.create
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

  expect((capturedOpts as Record<string, unknown>).session).toBe(fakeSession);
});

test("create: toolsRequested array passes through unchanged", async () => {
  const specialTools = ["getUserAccounts", "getAccountBalance", "getRecentTransactions"];
  const logWithTools = { ...leanLog, toolsRequested: specialTools };
  const returnedDoc = { ...logWithTools, toObject: () => logWithTools };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create
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

  expect(rec.toolsRequested).toStrictEqual(specialTools);
});

test("create: toolsExecuted array passes through unchanged", async () => {
  const specialTools = ["getUserAccounts", "searchTransactions"];
  const logWithTools = { ...leanLog, toolsExecuted: specialTools };
  const returnedDoc = { ...logWithTools, toObject: () => logWithTools };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create
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

  expect(rec.toolsExecuted).toStrictEqual(specialTools);
});

test("create: diagnostics array passes through unchanged", async () => {
  const specialDiagnostics = [
    { type: "failure", nodeName: "classifier", createdAt: "2026-01-01T00:00:00.000Z", failureClass: "classifier_failed" },
    { type: "snapshot", nodeName: "end", createdAt: "2026-01-01T00:00:01.000Z" }
  ];
  const logWithDiag = { ...leanLog, diagnostics: specialDiagnostics };
  const returnedDoc = { ...logWithDiag, toObject: () => logWithDiag };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create
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

  expect(rec.diagnostics).toStrictEqual(specialDiagnostics);
});

test("create: requestId=null is preserved", async () => {
  const logNullReq = { ...leanLog, requestId: null };
  const returnedDoc = { ...logNullReq, toObject: () => logNullReq };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create
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

  expect(rec.requestId).toBeNull();
});

test("create: refusalReason is preserved when set", async () => {
  const logWithRefusal = { ...leanLog, refusalReason: "unsafe_request_detected" };
  const returnedDoc = { ...logWithRefusal, toObject: () => logWithRefusal };
  patch(
    AiAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof AiAuditLog.create
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

  expect(rec.refusalReason).toBe("unsafe_request_detected");
});
