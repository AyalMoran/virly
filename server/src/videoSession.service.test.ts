import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { parseCookies } from "./middleware/cookies.js";
import { errorHandler } from "./middleware/error-handler.js";
import videoSessionRoutes from "./routes/videoSession.routes.js";
import { setRepositories, getRepositories } from "./repositories/index.js";
import type { PublicUserRecord, UserRepository, VideoSessionRecord, VideoSessionRepository, VideoAuditLogRepository, Repositories } from "./repositories/types.js";
import {
  createVideoSession,
  endVideoSession,
  getOwnVideoSession,
  issueVideoJoinConfig,
  listAgentVideoSessions,
  VideoSessionServiceError
} from "./services/videoSession.service.js";

const userId = "507f1f77bcf86cd799439011";
const otherUserId = "507f191e810c19729de860ea";
const supportAgentId = "507f1f77bcf86cd799439012";
const salesAgentId = "507f1f77bcf86cd799439013";
const sessionId = "507f1f77bcf86cd799439099";

type MockUser = PublicUserRecord;

type MockSession = VideoSessionRecord;

function createMockUser(id: string, role = "user", email = "user@example.com"): MockUser {
  return {
    id,
    email,
    phone: "+972000000000",
    isVerified: true,
    personalDetails: null,
    verificationTokenExpiresAt: null,
    balance: 0,
    role: role as MockUser["role"],
    createdAt: new Date("2026-06-09T00:00:00.000Z"),
    updatedAt: new Date("2026-06-09T00:00:00.000Z")
  };
}

/** Minimal UserRepository stub. `users` are matched by id for findByIdSafe and
 *  findManyByIds; the actor for getActor() is resolved from this same list. */
function makeUserRepo(users: MockUser[] = []): UserRepository {
  const find = (id: string) => users.find((u) => u.id === id) ?? null;
  return {
    async findById(id) { return find(id) as never; },
    async findByIdSafe(id) { return find(id); },
    async findByEmail() { return null; },
    async findByEmails() { return []; },
    async findManyByIds(ids) { return users.filter((u) => ids.includes(u.id)) as never; },
    async create() { throw new Error("not implemented"); },
    async setBalance() {},
    async setVerificationToken() {},
    async markVerified() {},
    async setPersonalDetails() {}
  };
}

function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    id: sessionId,
    userId,
    assignedAgentId: null,
    type: "support",
    status: "waiting_for_agent",
    roomName: "virly-support-opaque-random",
    provider: "jitsi-public-demo",
    topic: null,
    userProblemSummary: null,
    metadata: { userAgent: null, locale: null, source: "dashboard" },
    createdAt: new Date("2026-06-09T00:00:00.000Z"),
    updatedAt: new Date("2026-06-09T00:00:00.000Z"),
    startedAt: null,
    endedAt: null,
    userJoinedAt: null,
    agentJoinedAt: null,
    ...overrides
  };
}

/** Build a minimal VideoSessionRepository stub for testing.
 *  Pass `sessions` for findById/listForAgentQueue lookups.
 *  `update` merges the patch into the session and returns it.
 */
function makeSessionRepo(
  sessions: MockSession[] = []
): VideoSessionRepository {
  return {
    async findById(id) {
      return sessions.find((s) => s.id === id) ?? null;
    },
    async findByRoomName(roomName) {
      return sessions.find((s) => s.roomName === roomName) ?? null;
    },
    async create(input) {
      const rec: VideoSessionRecord = {
        id: sessionId,
        ...input,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      sessions.push(rec);
      return rec;
    },
    async update(id, patch) {
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      Object.assign(sessions[idx], patch);
      return sessions[idx];
    },
    async listForUser(uid) {
      return sessions.filter((s) => s.userId === uid);
    },
    async listForAgentQueue({ types, status, limit }) {
      let result = sessions.filter((s) => types.includes(s.type));
      if (status) result = result.filter((s) => s.status === status);
      result = [...result].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      return result.slice(0, limit);
    }
  };
}

/** A no-op VideoAuditLogRepository stub that records calls for inspection. */
function makeAuditLogRepo(): VideoAuditLogRepository & { events: unknown[] } {
  const events: unknown[] = [];
  return {
    events,
    async create(input) {
      events.push(input);
      return {
        id: "audit-log-stub-id",
        ...input,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  };
}

/** Install a mock repo for the duration of the test, restoring after.
 *  `users` are exposed via the users repo (getActor/listAgentVideoSessions). */
function withRepo(
  t: test.TestContext,
  sessions: MockSession[] = [],
  users: MockUser[] = []
): MockSession[] {
  const previous = (() => {
    try { return getRepositories(); } catch { return null; }
  })();

  // Build a full Repositories shell — only users, videoSessions and videoAuditLogs are exercised here
  const stub = {
    videoSessions: makeSessionRepo(sessions),
    videoAuditLogs: makeAuditLogRepo(),
    users: makeUserRepo(users),
    // stubs for other repos (not called in these tests)
    transactions: {} as never,
    personalDetails: {} as never,
    exchangeRates: {} as never,
    aiConversations: {} as never,
    aiPendingTransfers: {} as never,
    aiAuditLogs: {} as never,
    async runInTransaction<T>(fn: (tx: unknown) => Promise<T>) { return fn(undefined); }
  } as unknown as Repositories;

  setRepositories(stub);
  t.after(() => {
    if (previous) setRepositories(previous);
  });
  return sessions;
}

// patchAuditLog is no longer needed — writeVideoAuditLog now goes through
// getRepositories().videoAuditLogs.create(), which is stubbed by withRepo().
// The actor lookup (getActor) now goes through getRepositories().users.findByIdSafe,
// which is stubbed by withRepo()'s third `users` argument.

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());
  app.use("/api/video-sessions", videoSessionRoutes);
  app.use(errorHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, "string");

    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address.");
    }

    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("unauthenticated users cannot create video sessions", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/video-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "support" })
    });
    const body = (await response.json()) as { message: string };

    assert.equal(response.status, 401);
    assert.equal(body.message, "Authentication required.");
  });
});

test("created room names do not leak user identity data", async (t) => {
  const user = createMockUser(userId, "user", "sensitive.customer@example.com");
  const sessions = withRepo(t, [], [user]);

  const session = await createVideoSession({
    userId,
    type: "support",
    topic: "transfer status",
    source: "dashboard"
  });

  assert.equal(session.id, sessionId);
  assert.match(session.roomName, /^virly-support-[a-f0-9]{32}-[A-Za-z0-9_-]+$/);
  assert.equal(session.roomName.includes(userId), false);
  assert.equal(session.roomName.includes("sensitive"), false);
  assert.equal(session.roomName.includes("customer"), false);
  assert.equal(session.roomName.includes("example.com"), false);
  void sessions; // used via withRepo side effect
});

test("users cannot read another user's video session", async (t) => {
  withRepo(t, [createMockSession({ userId: otherUserId })]);

  await assert.rejects(
    () => getOwnVideoSession(userId, sessionId),
    (error) =>
      error instanceof VideoSessionServiceError &&
      error.status === 404 &&
      error.error === "session_not_found"
  );
});

test("unauthorized user roles cannot list agent video sessions", async (t) => {
  withRepo(t, [], [createMockUser(userId, "user")]);

  await assert.rejects(
    () => listAgentVideoSessions({ actorId: userId }),
    (error) =>
      error instanceof VideoSessionServiceError &&
      error.status === 403 &&
      error.error === "video_agent_required"
  );
});

test("sales agents cannot join support video sessions", async (t) => {
  withRepo(t, [createMockSession({ type: "support" })], [createMockUser(salesAgentId, "sales_agent")]);

  await assert.rejects(
    () =>
      issueVideoJoinConfig({
        actorId: salesAgentId,
        sessionId,
        actorKind: "agent"
      }),
    (error) =>
      error instanceof VideoSessionServiceError &&
      error.status === 403 &&
      error.error === "video_session_type_forbidden"
  );
});

test("agent join activates a waiting session and ending marks it ended", async (t) => {
  const sessions = withRepo(t, [createMockSession()], [createMockUser(supportAgentId, "support_agent")]);

  const joinResult = await issueVideoJoinConfig({
    actorId: supportAgentId,
    sessionId,
    actorKind: "agent"
  });

  assert.equal(joinResult.session.status, "active");
  assert.equal(joinResult.session.assignedAgentId, supportAgentId);
  assert.ok(joinResult.session.startedAt);
  assert.ok(joinResult.session.agentJoinedAt);
  assert.equal(joinResult.jitsi.jwt, undefined);
  assert.equal(joinResult.jitsi.roomName, sessions[0].roomName);

  const ended = await endVideoSession({
    actorId: supportAgentId,
    sessionId,
    actorKind: "agent"
  });

  assert.equal(ended.status, "ended");
  assert.ok(ended.endedAt);
});

test("user ending a waiting session cancels it", async (t) => {
  withRepo(t, [createMockSession({ status: "waiting_for_agent" })], [createMockUser(userId, "user")]);

  const cancelled = await endVideoSession({
    actorId: userId,
    sessionId,
    actorKind: "user"
  });

  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.endedAt);
});
