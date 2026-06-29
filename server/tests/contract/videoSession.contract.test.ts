// server/tests/contract/videoSession.contract.test.ts
import { describeContract } from "./harness.js";
import type { VideoSessionRecord } from "../../src/repositories/types.js";

const USER = "a".repeat(24);

function makeSession(
  overrides: Partial<Omit<VideoSessionRecord, "id" | "createdAt" | "updatedAt">> = {}
): Omit<VideoSessionRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: USER,
    assignedAgentId: null,
    type: "support",
    status: "waiting_for_agent",
    roomName: `room-${Math.random().toString(36).slice(2)}`,
    provider: "jitsi-public-demo",
    topic: null,
    userProblemSummary: null,
    startedAt: null,
    endedAt: null,
    userJoinedAt: null,
    agentJoinedAt: null,
    metadata: { userAgent: "UA/1.0", locale: "he-IL", source: "dashboard" },
    ...overrides
  };
}

describeContract("VideoSessionRepository", {
  "create then findById round-trips all fields with a 24-hex id": async ({ repos }) => {
    const created = await repos.videoSessions.create(
      makeSession({ roomName: "room-A", topic: "billing", type: "sales" })
    );
    expect(created.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(created.userId).toBe(USER);
    expect(created.type).toBe("sales");
    expect(created.status).toBe("waiting_for_agent");
    expect(created.roomName).toBe("room-A");
    expect(created.topic).toBe("billing");
    expect(created.assignedAgentId).toBeNull();
    expect(created.metadata).toStrictEqual({ userAgent: "UA/1.0", locale: "he-IL", source: "dashboard" });

    const found = await repos.videoSessions.findById(created.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
    expect(found!.roomName).toBe("room-A");
  },

  "findById returns null for malformed and missing ids": async ({ repos }) => {
    expect(await repos.videoSessions.findById("not-an-id")).toBeNull();
    expect(await repos.videoSessions.findById("f".repeat(24))).toBeNull();
  },

  "findByRoomName returns the session or null": async ({ repos }) => {
    const created = await repos.videoSessions.create(makeSession({ roomName: "room-unique-1" }));
    const found = await repos.videoSessions.findByRoomName("room-unique-1");
    expect(found).toBeTruthy();
    expect(found!.id).toBe(created.id);
    expect(await repos.videoSessions.findByRoomName("no-such-room")).toBeNull();
  },

  "metadata projects to {userAgent, locale, source} with null/explicit values": async ({ repos }) => {
    const created = await repos.videoSessions.create(
      makeSession({ roomName: "room-meta", metadata: { userAgent: null, locale: null, source: "ai_assistant" } })
    );
    expect(created.metadata).toStrictEqual({ userAgent: null, locale: null, source: "ai_assistant" });
    const found = await repos.videoSessions.findById(created.id);
    expect(found?.metadata).toStrictEqual({ userAgent: null, locale: null, source: "ai_assistant" });
  },

  "update patches fields, bumps updatedAt, returns the updated record": async ({ repos }) => {
    const created = await repos.videoSessions.create(makeSession({ roomName: "room-upd" }));
    const startedAt = new Date("2024-05-01T10:00:00.000Z");
    const updated = await repos.videoSessions.update(created.id, {
      status: "active",
      assignedAgentId: "b".repeat(24),
      startedAt
    });
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe("active");
    expect(updated!.assignedAgentId).toBe("b".repeat(24));
    expect(updated!.startedAt?.toISOString()).toBe("2024-05-01T10:00:00.000Z");
    expect(updated!.updatedAt >= created.updatedAt).toBeTruthy();
    // unchanged fields preserved
    expect(updated!.roomName).toBe("room-upd");
  },

  "update returns null for malformed and missing ids": async ({ repos }) => {
    expect(await repos.videoSessions.update("bad", { status: "active" })).toBeNull();
    expect(await repos.videoSessions.update("f".repeat(24), { status: "active" })).toBeNull();
  },

  "update can replace metadata wholesale": async ({ repos }) => {
    const created = await repos.videoSessions.create(makeSession({ roomName: "room-meta-upd" }));
    const updated = await repos.videoSessions.update(created.id, {
      metadata: { userAgent: "UA/2.0", locale: "en-US", source: "account_page" }
    });
    expect(updated?.metadata).toStrictEqual({ userAgent: "UA/2.0", locale: "en-US", source: "account_page" });
  },

  "listForUser returns the user's sessions newest-first": async ({ repos }) => {
    const a = await repos.videoSessions.create(makeSession({ roomName: "r1" }));
    await new Promise((r) => setTimeout(r, 5));
    const b = await repos.videoSessions.create(makeSession({ roomName: "r2" }));
    // different user — must be excluded
    await repos.videoSessions.create(makeSession({ roomName: "r3", userId: "c".repeat(24) }));

    const rows = await repos.videoSessions.listForUser(USER);
    expect(rows.map((r) => r.id)).toStrictEqual([b.id, a.id]);
  },

  "listForAgentQueue filters by types and optional status, newest-first, capped by limit": async ({ repos }) => {
    const s1 = await repos.videoSessions.create(makeSession({ roomName: "q1", type: "support", status: "waiting_for_agent" }));
    await new Promise((r) => setTimeout(r, 5));
    const s2 = await repos.videoSessions.create(makeSession({ roomName: "q2", type: "sales", status: "waiting_for_agent" }));
    await new Promise((r) => setTimeout(r, 5));
    const s3 = await repos.videoSessions.create(makeSession({ roomName: "q3", type: "support", status: "active" }));

    // single type
    const support = await repos.videoSessions.listForAgentQueue({ types: ["support"], limit: 10 });
    expect(support.map((r) => r.id).sort()).toStrictEqual([s1.id, s3.id].sort());

    // multiple types, newest-first
    const all = await repos.videoSessions.listForAgentQueue({ types: ["support", "sales"], limit: 10 });
    expect(all.map((r) => r.id)).toStrictEqual([s3.id, s2.id, s1.id]);

    // type + status
    const waitingSupport = await repos.videoSessions.listForAgentQueue({
      types: ["support"],
      status: "waiting_for_agent",
      limit: 10
    });
    expect(waitingSupport.map((r) => r.id)).toStrictEqual([s1.id]);

    // limit
    const limited = await repos.videoSessions.listForAgentQueue({ types: ["support", "sales"], limit: 2 });
    expect(limited.length).toBe(2);
    expect(limited.map((r) => r.id)).toStrictEqual([s3.id, s2.id]);
  }
});
