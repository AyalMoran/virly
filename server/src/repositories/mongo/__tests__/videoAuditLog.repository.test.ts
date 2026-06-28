

// src/repositories/mongo/videoAuditLog.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { VideoAuditLog } from "../../../models/VideoAuditLog.js";
import { mongoVideoAuditLogRepository } from "../videoAuditLog.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k];
  o[k] = v;
  t.after(() => {
    o[k] = orig;
  });
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

test("videoAuditLog.create: maps returned doc to VideoAuditLogRecord with string id, no _id leaked", async (t) => {
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create,
    t
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

  assert.ok(rec);
  assert.equal(rec.id, LOG_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined, "must not expose _id");
  assert.equal(rec.actorId, ACTOR_OID);
  assert.equal(rec.targetUserId, TARGET_OID);
  assert.equal(rec.videoSessionId, SESSION_OID);
  assert.equal(rec.event, "video_session_created");
  assert.equal(rec.actorRole, "support_agent");
  assert.equal(rec.sessionType, "support");
  assert.equal(rec.result, "success");
  assert.ok(rec.createdAt instanceof Date);
  assert.ok(rec.updatedAt instanceof Date);
});

test("videoAuditLog.create: passes all fields to VideoAuditLog.create", async (t) => {
  let capturedDocs: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    VideoAuditLog,
    "create",
    (async (docs: unknown) => { capturedDocs = docs; return [returnedDoc]; }) as unknown as typeof VideoAuditLog.create,
    t
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
  assert.ok(Array.isArray(docs) && docs.length === 1, "should pass array with one item");
  const doc = docs[0];
  assert.equal(doc.event, "video_session_ended");
  assert.equal(doc.actorId, ACTOR_OID);
  assert.equal(doc.actorRole, "support_agent");
  assert.equal(doc.targetUserId, TARGET_OID);
  assert.equal(doc.videoSessionId, SESSION_OID);
  assert.equal(doc.sessionType, "support");
  assert.equal(doc.result, "success");
  assert.equal(doc.ipAddress, "10.0.0.1");
  assert.equal(doc.userAgent, "TestAgent/1.0");
  assert.deepEqual(doc.details, { foo: "bar" });
});

test("videoAuditLog.create: passes session when tx context is provided", async (t) => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanLog, toObject: () => leanLog };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown, opts: unknown) => { capturedOpts = opts; return [returnedDoc]; }) as unknown as typeof VideoAuditLog.create,
    t
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

  assert.equal((capturedOpts as Record<string, unknown>).session, fakeSession);
});

test("videoAuditLog.create: ipAddress=null is preserved", async (t) => {
  const logNullIp = { ...leanLog, ipAddress: null };
  const returnedDoc = { ...logNullIp, toObject: () => logNullIp };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create,
    t
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

  assert.equal(rec.ipAddress, null);
});

test("videoAuditLog.create: details plain object passes through unchanged", async (t) => {
  const complexDetails = { action: "join", metadata: { clientVersion: "1.2.3" }, tags: ["a", "b"] };
  const logWithDetails = { ...leanLog, details: complexDetails };
  const returnedDoc = { ...logWithDetails, toObject: () => logWithDetails };
  patch(
    VideoAuditLog,
    "create",
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create,
    t
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

  assert.deepEqual(rec.details, complexDetails);
});

test("videoAuditLog.create: actorId/targetUserId/videoSessionId are stringified in the record", async (t) => {
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
    (async (_docs: unknown) => [returnedDoc]) as unknown as typeof VideoAuditLog.create,
    t
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

  assert.equal(typeof rec.actorId, "string");
  assert.equal(typeof rec.targetUserId, "string");
  assert.equal(typeof rec.videoSessionId, "string");
  assert.equal(rec.actorId, ACTOR_OID);
  assert.equal(rec.targetUserId, TARGET_OID);
  assert.equal(rec.videoSessionId, SESSION_OID);
});
