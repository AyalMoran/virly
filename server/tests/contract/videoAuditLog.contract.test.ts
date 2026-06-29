// server/tests/contract/videoAuditLog.contract.test.ts
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
    expect(created.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(created.event).toBe("video_session_created");
    expect(created.actorId).toBe("a".repeat(24));
    expect(created.actorRole).toBe("support_agent");
    expect(created.targetUserId).toBe("b".repeat(24));
    expect(created.videoSessionId).toBe("c".repeat(24));
    expect(created.sessionType).toBe("support");
    expect(created.result).toBe("success");
    expect(created.ipAddress).toBe("203.0.113.7");
    expect(created.userAgent).toBe("UA/1.0");
    expect(created.details).toStrictEqual({ reason: "user requested" });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  },

  "create persists null ipAddress/userAgent and a failure result": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(
      makeAudit({ ipAddress: null, userAgent: null, result: "failure", event: "video_session_failed" })
    );
    expect(created.ipAddress).toBeNull();
    expect(created.userAgent).toBeNull();
    expect(created.result).toBe("failure");
    expect(created.event).toBe("video_session_failed");
  },

  "empty details object round-trips as an empty object": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(makeAudit({ details: {} }));
    expect(created.details).toStrictEqual({});
  },

  "details (jsonb) round-trips a nested structure exactly": async ({ repos }) => {
    const details = {
      tokenTtlSeconds: 3600,
      assignment: { agentId: "d".repeat(24), queueWaitMs: 1250 },
      flags: ["recorded", "transcribed"]
    };
    const created = await repos.videoAuditLogs.create(makeAudit({ details }));
    expect(created.details).toStrictEqual(details);
  },

  "sales sessionType and a manager actorRole round-trip": async ({ repos }) => {
    const created = await repos.videoAuditLogs.create(
      makeAudit({ sessionType: "sales", actorRole: "sales_agent", event: "video_session_assigned" })
    );
    expect(created.sessionType).toBe("sales");
    expect(created.actorRole).toBe("sales_agent");
  }
});
