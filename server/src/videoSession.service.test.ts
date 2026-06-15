import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { parseCookies } from "./middleware/cookies.js";
import videoSessionRoutes from "./routes/videoSession.routes.js";
import { User } from "./models/User.js";
import { VideoSession } from "./models/VideoSession.js";
import { VideoAuditLog } from "./models/VideoAuditLog.js";
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

type MockUser = {
  _id: string;
  id: string;
  email: string;
  role?: string;
};

type MockSession = {
  _id: string;
  id: string;
  userId: string;
  assignedAgentId: string | null;
  type: "support" | "sales";
  status:
    | "requested"
    | "waiting_for_agent"
    | "active"
    | "ended"
    | "missed"
    | "cancelled"
    | "failed";
  roomName: string;
  provider: "jitsi-public-demo";
  topic: string | null;
  userProblemSummary: string | null;
  metadata: {
    source: "dashboard" | "ai_assistant" | "transfer_flow" | "account_page";
  };
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  userJoinedAt: Date | null;
  agentJoinedAt: Date | null;
  save: () => Promise<void>;
};

function createMockUser(id: string, role = "user", email = "user@example.com"): MockUser {
  return {
    _id: id,
    id,
    email,
    role
  };
}

function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    _id: sessionId,
    id: sessionId,
    userId,
    assignedAgentId: null,
    type: "support",
    status: "waiting_for_agent",
    roomName: "virly-support-opaque-random",
    provider: "jitsi-public-demo",
    topic: null,
    userProblemSummary: null,
    metadata: {
      source: "dashboard"
    },
    createdAt: new Date("2026-06-09T00:00:00.000Z"),
    updatedAt: new Date("2026-06-09T00:00:00.000Z"),
    startedAt: null,
    endedAt: null,
    userJoinedAt: null,
    agentJoinedAt: null,
    async save() {},
    ...overrides
  };
}

function patchModel<T extends object, K extends keyof T>(
  model: T,
  key: K,
  value: T[K],
  t: test.TestContext
) {
  const original = model[key];
  model[key] = value;
  t.after(() => {
    model[key] = original;
  });
}

function patchAuditLog(t: test.TestContext) {
  const events: unknown[] = [];
  patchModel(
    VideoAuditLog,
    "create",
    (async (input: unknown) => {
      events.push(input);
      return input;
    }) as unknown as typeof VideoAuditLog.create,
    t
  );
  return events;
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());
  app.use("/api/video-sessions", videoSessionRoutes);

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
  patchAuditLog(t);
  const user = createMockUser(userId, "user", "sensitive.customer@example.com");
  let capturedRoomName = "";

  patchModel(
    User,
    "findById",
    (async () => user) as unknown as typeof User.findById,
    t
  );
  patchModel(
    VideoSession,
    "create",
    (async (input: Partial<MockSession>) => {
      const session = createMockSession({
        ...input,
        _id: sessionId,
        id: sessionId
      } as Partial<MockSession>);
      capturedRoomName = session.roomName;
      return session;
    }) as unknown as typeof VideoSession.create,
    t
  );

  const session = await createVideoSession({
    userId,
    type: "support",
    topic: "transfer status",
    source: "dashboard"
  });

  assert.equal(session.id, sessionId);
  assert.match(capturedRoomName, /^virly-support-[a-f0-9]{32}-[A-Za-z0-9_-]+$/);
  assert.equal(capturedRoomName.includes(userId), false);
  assert.equal(capturedRoomName.includes("sensitive"), false);
  assert.equal(capturedRoomName.includes("customer"), false);
  assert.equal(capturedRoomName.includes("example.com"), false);
});

test("users cannot read another user's video session", async (t) => {
  patchModel(
    VideoSession,
    "findById",
    (async () => createMockSession({ userId: otherUserId })) as unknown as typeof VideoSession.findById,
    t
  );

  await assert.rejects(
    () => getOwnVideoSession(userId, sessionId),
    (error) =>
      error instanceof VideoSessionServiceError &&
      error.status === 404 &&
      error.error === "session_not_found"
  );
});

test("unauthorized user roles cannot list agent video sessions", async (t) => {
  patchModel(
    User,
    "findById",
    (async () => createMockUser(userId, "user")) as unknown as typeof User.findById,
    t
  );

  await assert.rejects(
    () => listAgentVideoSessions({ actorId: userId }),
    (error) =>
      error instanceof VideoSessionServiceError &&
      error.status === 403 &&
      error.error === "video_agent_required"
  );
});

test("sales agents cannot join support video sessions", async (t) => {
  patchAuditLog(t);
  patchModel(
    User,
    "findById",
    (async () => createMockUser(salesAgentId, "sales_agent")) as unknown as typeof User.findById,
    t
  );
  patchModel(
    VideoSession,
    "findById",
    (async () => createMockSession({ type: "support" })) as unknown as typeof VideoSession.findById,
    t
  );

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
  patchAuditLog(t);
  const session = createMockSession();

  patchModel(
    User,
    "findById",
    (async () => createMockUser(supportAgentId, "support_agent")) as unknown as typeof User.findById,
    t
  );
  patchModel(
    VideoSession,
    "findById",
    (async () => session) as unknown as typeof VideoSession.findById,
    t
  );

  const joinResult = await issueVideoJoinConfig({
    actorId: supportAgentId,
    sessionId,
    actorKind: "agent"
  });

  assert.equal(joinResult.session.status, "active");
  assert.equal(session.assignedAgentId, supportAgentId);
  assert.ok(session.startedAt);
  assert.ok(session.agentJoinedAt);
  assert.equal(joinResult.jitsi.jwt, undefined);
  assert.equal(joinResult.jitsi.roomName, session.roomName);

  const ended = await endVideoSession({
    actorId: supportAgentId,
    sessionId,
    actorKind: "agent"
  });

  assert.equal(ended.status, "ended");
  assert.ok(ended.endedAt);
});

test("user ending a waiting session cancels it", async (t) => {
  patchAuditLog(t);
  const session = createMockSession({ status: "waiting_for_agent" });

  patchModel(
    User,
    "findById",
    (async () => createMockUser(userId, "user")) as unknown as typeof User.findById,
    t
  );
  patchModel(
    VideoSession,
    "findById",
    (async () => session) as unknown as typeof VideoSession.findById,
    t
  );

  const cancelled = await endVideoSession({
    actorId: userId,
    sessionId,
    actorKind: "user"
  });

  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.endedAt);
});
