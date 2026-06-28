

// src/repositories/mongo/videoAuditLog.repository.test.ts
import { VideoAuditLog } from "../../../models/VideoAuditLog.js";
import { mongoVideoAuditLogRepository } from "../videoAuditLog.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k];
  o[k] = v;
  cleanups.push(() => { o[k] = orig; });
}

const LOG_OID = "507f1f77bcf86cd799439011";
const ACTOR_OID = "507f191e810c19729de860ea";
const TARGET_OID = "507f191e810c19729de860eb";
const SESSION_OID = "507f191e810c19729de860ec";

const leanLog = {
  _id: LOG_OID,
  event: "video_session_created",
  actorId: ACTOR_OID,
  actorRole: "support_agent",
  targetUserId: TARGET_OID,
  videoSessionId: SESSION_OID,
  sessionType: "support",
  result: "success",
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0",
  details: { reason: "test" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

test("videoAuditLog.create: maps returned doc to VideoAuditLogRecord with string id, no _id leaked", async () => {
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create
  );

  const input = {
    event: "video_session_created" as const,
    actorId: ACTOR_OID,
    actorRole: "support_agent" as const,
    targetUserId: TARGET_OID,
    videoSessionId: SESSION_OID,
    sessionType: "support" as const,
    result: "success" as const,
    ipAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    details: { reason: "test" }
  };

  const rec = await mongoVideoAuditLogRepository.create(input);

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(LOG_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec.actorId).toBe(ACTOR_OID);
  expect(rec.targetUserId).toBe(TARGET_OID);
  expect(rec.videoSessionId).toBe(SESSION_OID);
  expect(rec.event).toBe("video_session_created");
  expect(rec.actorRole).toBe("support_agent");
  expect(rec.sessionType).toBe("support");
  expect(rec.result).toBe("success");
  expect(rec.createdAt).toBeInstanceOf(Date);
  expect(rec.updatedAt).toBeInstanceOf(Date);
});

test("videoAuditLog.create: passes all fields to VideoAuditLog.create", async () => {
  let capturedDocs: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    VideoAuditLog,
    "create",
    (async (docs: unknown) => { capturedDocs = docs; return [returnedDoc]; }) as unknown as typeof VideoAuditLog.create
  );

  const input = {
    event: "video_session_ended" as const,
    actorId: ACTOR_OID,
    actorRole: "support_agent" as const,
    targetUserId: TARGET_OID,
    videoSessionId: SESSION_OID,
    sessionType: "support" as const,
    result: "success" as const,
    ipAddress: "10.0.0.1",
    userAgent: "TestAgent/1.0",
    details: { foo: "bar" }
  };

  await mongoVideoAuditLogRepository.create(input);

  const docs = capturedDocs as Array<Record<string, unknown>>;
  expect(Array.isArray(docs) && docs.length === 1).toBeTruthy();
  const doc = docs[0];
  expect(doc.event).toBe("video_session_ended");
  expect(doc.actorId).toBe(ACTOR_OID);
  expect(doc.actorRole).toBe("support_agent");
  expect(doc.targetUserId).toBe(TARGET_OID);
  expect(doc.videoSessionId).toBe(SESSION_OID);
  expect(doc.sessionType).toBe("support");
  expect(doc.result).toBe("success");
  expect(doc.ipAddress).toBe("10.0.0.1");
  expect(doc.userAgent).toBe("TestAgent/1.0");
  expect(doc.details).toStrictEqual({ foo: "bar" });
});

test("videoAuditLog.create: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown, opts: unknown) => { capturedOpts = opts; return [returnedDoc]; }) as unknown as typeof VideoAuditLog.create
  );

  const input = {
    event: "video_session_created" as const,
    actorId: ACTOR_OID,
    actorRole: "support_agent" as const,
    targetUserId: TARGET_OID,
    videoSessionId: SESSION_OID,
    sessionType: "support" as const,
    result: "success" as const,
    ipAddress: null,
    userAgent: null,
    details: {}
  };

  await mongoVideoAuditLogRepository.create(input, fakeSession);

  expect((capturedOpts as Record<string, unknown>).session).toBe(fakeSession);
});

test("videoAuditLog.create: ipAddress=null is preserved", async () => {
  const logNullIp = { ...leanLog, ipAddress: null };
  const returnedDoc = { ...logNullIp, toObject: () => logNullIp };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create
  );

  const rec = await mongoVideoAuditLogRepository.create({
    event: "video_session_created" as const,
    actorId: ACTOR_OID,
    actorRole: "support_agent" as const,
    targetUserId: TARGET_OID,
    videoSessionId: SESSION_OID,
    sessionType: "support" as const,
    result: "success" as const,
    ipAddress: null,
    userAgent: null,
    details: {}
  });

  expect(rec.ipAddress).toBeNull();
});

test("videoAuditLog.create: details plain object passes through unchanged", async () => {
  const complexDetails = { action: "join", metadata: { clientVersion: "1.2.3" }, tags: ["a", "b"] };
  const logWithDetails = { ...leanLog, details: complexDetails };
  const returnedDoc = { ...logWithDetails, toObject: () => logWithDetails };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create
  );

  const rec = await mongoVideoAuditLogRepository.create({
    event: "video_session_created" as const,
    actorId: ACTOR_OID,
    actorRole: "support_agent" as const,
    targetUserId: TARGET_OID,
    videoSessionId: SESSION_OID,
    sessionType: "support" as const,
    result: "success" as const,
    ipAddress: null,
    userAgent: null,
    details: complexDetails
  });

  expect(rec.details).toStrictEqual(complexDetails);
});

test("videoAuditLog.create: actorId/targetUserId/videoSessionId are stringified in the record", async () => {
  // Simulate Mongoose returning ObjectId-like objects from .toObject()
  const oidLike = { toString: () => ACTOR_OID };
  const targetOidLike = { toString: () => TARGET_OID };
  const sessionOidLike = { toString: () => SESSION_OID };
  const logWithOids = {
    ...leanLog,
    actorId: oidLike,
    targetUserId: targetOidLike,
    videoSessionId: sessionOidLike
  };
  const returnedDoc = { ...logWithOids, toObject: () => logWithOids };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create
  );

  const rec = await mongoVideoAuditLogRepository.create({
    event: "video_session_created" as const,
    actorId: ACTOR_OID,
    actorRole: "support_agent" as const,
    targetUserId: TARGET_OID,
    videoSessionId: SESSION_OID,
    sessionType: "support" as const,
    result: "success" as const,
    ipAddress: null,
    userAgent: null,
    details: {}
  });

  expect(typeof rec.actorId).toBe("string");
  expect(typeof rec.targetUserId).toBe("string");
  expect(typeof rec.videoSessionId).toBe("string");
  expect(rec.actorId).toBe(ACTOR_OID);
  expect(rec.targetUserId).toBe(TARGET_OID);
  expect(rec.videoSessionId).toBe(SESSION_OID);
});
