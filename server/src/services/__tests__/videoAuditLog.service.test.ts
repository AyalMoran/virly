import { writeVideoAuditLog } from "../videoAuditLog.service.js";
import type { WriteVideoAuditLogInput } from "../videoAuditLog.service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { Repositories, VideoAuditLogRecord } from "../../repositories/types.js";

const base = createMongoRepositories();

afterEach(() => {
  setRepositories(base);
});

function stubRecord(): VideoAuditLogRecord {
  return {
    id: "log-1",
    event: "session.started",
    actorId: "u1",
    actorRole: "support_agent",
    targetUserId: "u2",
    videoSessionId: "sess-1",
    sessionType: "support",
    result: "success",
    ipAddress: null,
    userAgent: null,
    details: {},
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function baseInput(): WriteVideoAuditLogInput {
  return {
    event: "session.started",
    actorId: "u1",
    actorRole: "support_agent",
    targetUserId: "u2",
    videoSessionId: "sess-1",
    sessionType: "support"
  };
}

describe("writeVideoAuditLog", () => {
  test("calls videoAuditLogs.create with all fields from the input", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog({
      ...baseInput(),
      result: "success",
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      details: { reason: "joined" }
    });

    expect(captured).not.toBeNull();
    expect(captured!.event).toBe("session.started");
    expect(captured!.actorId).toBe("u1");
    expect(captured!.actorRole).toBe("support_agent");
    expect(captured!.targetUserId).toBe("u2");
    expect(captured!.videoSessionId).toBe("sess-1");
    expect(captured!.sessionType).toBe("support");
    expect(captured!.result).toBe("success");
    expect(captured!.ipAddress).toBe("1.2.3.4");
    expect(captured!.userAgent).toBe("Mozilla/5.0");
    expect(captured!.details).toStrictEqual({ reason: "joined" });
  });

  test("converts ObjectId-like actorId to a string", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    const objectIdLike = { toString: () => "507f1f77bcf86cd799439011" };
    await writeVideoAuditLog({
      ...baseInput(),
      actorId: objectIdLike as unknown as string
    });

    expect(typeof captured!.actorId).toBe("string");
    expect(captured!.actorId).toBe("507f1f77bcf86cd799439011");
  });

  test("converts ObjectId-like targetUserId and videoSessionId to strings", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    const mkId = (s: string) => ({ toString: () => s });
    await writeVideoAuditLog({
      ...baseInput(),
      targetUserId: mkId("target-id") as unknown as string,
      videoSessionId: mkId("sess-id") as unknown as string
    });

    expect(captured!.targetUserId).toBe("target-id");
    expect(captured!.videoSessionId).toBe("sess-id");
  });

  test("defaults result to 'success' when omitted", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog(baseInput());

    expect(captured!.result).toBe("success");
  });

  test("passes 'failure' result through unchanged", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog({ ...baseInput(), result: "failure" });

    expect(captured!.result).toBe("failure");
  });

  test("defaults ipAddress to null when omitted", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog(baseInput());

    expect(captured!.ipAddress).toBeNull();
  });

  test("defaults userAgent to null when omitted", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog(baseInput());

    expect(captured!.userAgent).toBeNull();
  });

  test("defaults details to empty object when omitted", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog(baseInput());

    expect(captured!.details).toStrictEqual({});
  });

  test("accepts a sales session type", async () => {
    let captured: Parameters<typeof base.videoAuditLogs.create>[0] | null = null;
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async (input) => {
          captured = input;
          return stubRecord();
        }
      } as Repositories["videoAuditLogs"]
    });

    await writeVideoAuditLog({ ...baseInput(), sessionType: "sales" });

    expect(captured!.sessionType).toBe("sales");
  });

  test("propagates repository errors to the caller", async () => {
    setRepositories({
      ...base,
      videoAuditLogs: {
        ...base.videoAuditLogs,
        create: async () => {
          throw new Error("db write failed");
        }
      } as Repositories["videoAuditLogs"]
    });

    await expect(writeVideoAuditLog(baseInput())).rejects.toThrow("db write failed");
  });
});
