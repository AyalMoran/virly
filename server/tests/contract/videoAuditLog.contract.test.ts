// server/tests/contract/videoAuditLog.contract.test.ts
import assert from "node:assert/strict";
import { describeContract } from "./harness.js";
import type { VideoAuditLogRecord } from "../../src/repositories/types.js";

function makeAudit(
  overrides: Partial<Omit<VideoAuditLogRecord, "id" | "createdAt" | "updatedAt">> = {}
): Omit<VideoAuditLogRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    event: "video_session_created",
    actorId: "a".repeat(24),
    actorRole: "support_agent",
    targetUserId: "b".repeat(24),
    videoSessionId: "c".repeat(24),
    sessionType: "support",
    result: "success",
    ipAddress: "203.0.113.7",
    userAgent: "UA/1.0",
    details: { reason: "user requested" },
    ...overrides
  };
}

describeContract("VideoAuditLogRepository", {
  "create returns a record with a 24-hex id and round-trips all fields": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(makeAudit());
    assert.match(created.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(created.event, "video_session_created");
    assert.equal(created.actorId, "a".repeat(24));
    assert.equal(created.actorRole, "support_agent");
    assert.equal(created.targetUserId, "b".repeat(24));
    assert.equal(created.videoSessionId, "c".repeat(24));
    assert.equal(created.sessionType, "support");
    assert.equal(created.result, "success");
    assert.equal(created.ipAddress, "203.0.113.7");
    assert.equal(created.userAgent, "UA/1.0");
    assert.deepEqual(created.details, { reason: "user requested" });
    assert.ok(created.createdAt instanceof Date);
    assert.ok(created.updatedAt instanceof Date);
  },

  "create persists null ipAddress/userAgent and a failure result": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(
      makeAudit({ ipAddress: null, userAgent: null, result: "failure", event: "video_session_failed" })
    );
    assert.equal(created.ipAddress, null);
    assert.equal(created.userAgent, null);
    assert.equal(created.result, "failure");
    assert.equal(created.event, "video_session_failed");
  },

  "empty details object round-trips as an empty object": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(makeAudit({ details: {} }));
    assert.deepEqual(created.details, {});
  },

  "details (jsonb) round-trips a nested structure exactly": async ({ repos }) => {
    const details = {
      tokenTtlSeconds: 3600,
      assignment: { agentId: "d".repeat(24), queueWaitMs: 1250 },
      flags: ["recorded", "transcribed"]
    };
    const created = await repos.videoAuditLogs.create(makeAudit({ details }));
    assert.deepEqual(created.details, details);
  },

  "sales sessionType and a manager actorRole round-trip": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(
      makeAudit({ sessionType: "sales", actorRole: "sales_agent", event: "video_session_assigned" })
    );
    assert.equal(created.sessionType, "sales");
    assert.equal(created.actorRole, "sales_agent");
  }
});
