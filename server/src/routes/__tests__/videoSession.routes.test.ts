import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { setRepositories } from "../../repositories/index.js";
import type {
  Repositories,
  VideoSessionRecord,
  PublicUserRecord
} from "../../repositories/types.js";
import videoSessionRoutes, { adminVideoSessionRoutes } from "../videoSession.routes.js";
import { setAuthCookies } from "../../utils/session.js";

setRepositories(createMongoRepositories());

const userId = "507f1f77bcf86cd799439011";
const agentId = "507f1f77bcf86cd799439022";
const sessionId = "507f191e810c19729de860ea";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

// ---------------------------------------------------------------------------
// Stubs / factories
// ---------------------------------------------------------------------------

function stubUser(overrides: Partial<PublicUserRecord> = {}): PublicUserRecord {
  return {
    id: userId,
    email: "alice@example.com",
    phone: "+972500000000",
    isVerified: true,
    balance: 100,
    role: "user",
    personalDetails: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function stubSession(overrides: Partial<VideoSessionRecord> = {}): VideoSessionRecord {
  return {
    id: sessionId,
    userId,
    assignedAgentId: null,
    type: "support",
    status: "waiting_for_agent",
    roomName: "virly-support-abc",
    provider: "jitsi-public-demo",
    topic: null,
    userProblemSummary: null,
    startedAt: null,
    endedAt: null,
    userJoinedAt: null,
    agentJoinedAt: null,
    metadata: { userAgent: null, locale: null, source: "dashboard" },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function patchRepos(overrides: Partial<Repositories>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, ...overrides });
  cleanups.push(() => setRepositories(base));
}

// ---------------------------------------------------------------------------
// withServer — mounts user and admin routers
// ---------------------------------------------------------------------------

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());

  // Auth-issuing helper endpoints (one for user, one for agent)
  app.post("/issue-user", (_req, res) => {
    const csrfToken = setAuthCookies(res, userId);
    return res.json({ csrfToken });
  });
  app.post("/issue-agent", (_req, res) => {
    const csrfToken = setAuthCookies(res, agentId);
    return res.json({ csrfToken });
  });

  app.use("/api/video-sessions", videoSessionRoutes);
  app.use("/api/admin/video-sessions", adminVideoSessionRoutes);
  app.use(errorHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address");
    }
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
    });
  }
}

function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (headers.getSetCookie) return headers.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*virly_)/) : [];
}

async function issueAuth(baseUrl: string, endpoint = "/issue-user") {
  const response = await fetch(`${baseUrl}${endpoint}`, { method: "POST" });
  const cookie = getSetCookieHeaders(response)
    .map((h) => h.split(";")[0])
    .join("; ");
  const { csrfToken } = (await response.json()) as { csrfToken: string };
  return { cookie, csrfToken };
}

async function postJson(
  baseUrl: string,
  path: string,
  auth: { cookie: string; csrfToken: string },
  body: unknown = {}
) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: auth.cookie,
      "X-CSRF-Token": auth.csrfToken
    },
    body: JSON.stringify(body)
  });
}

// ---------------------------------------------------------------------------
// POST /api/video-sessions — create session
// ---------------------------------------------------------------------------

describe("POST /api/video-sessions", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/video-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "support" })
      });
      expect(res.status).toBe(401);
    });
  });

  test("400 when body is missing the required type field", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/video-sessions", auth, {});
      expect(res.status).toBe(400);
    });
  });

  test("400 when type is not one of the allowed enum values", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/video-sessions", auth, { type: "unknown_type" });
      expect(res.status).toBe(400);
    });
  });

  test("201 with session DTO on successful creation", async () => {
    const session = stubSession();
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      videoSessions: {
        ...createMongoRepositories().videoSessions,
        create: async () => session
      } as Repositories["videoSessions"],
      videoAuditLogs: {
        ...createMongoRepositories().videoAuditLogs,
        create: async () => ({
          id: "log-1",
          event: "session.created",
          actorId: userId,
          actorRole: "user" as const,
          targetUserId: userId,
          videoSessionId: sessionId,
          sessionType: "support" as const,
          result: "success" as const,
          ipAddress: null,
          userAgent: null,
          details: {},
          createdAt: new Date(),
          updatedAt: new Date()
        })
      } as Repositories["videoAuditLogs"]
    });

    await withServer(async (baseUrl) => {
      const auth = await issueAuth(baseUrl);
      const res = await postJson(baseUrl, "/api/video-sessions", auth, { type: "support" });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { session: { id: string; type: string } };
      expect(body.session.id).toBe(sessionId);
      expect(body.session.type).toBe("support");
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/video-sessions/:id
// ---------------------------------------------------------------------------

describe("GET /api/video-sessions/:id", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/video-sessions/${sessionId}`);
      expect(res.status).toBe(401);
    });
  });

  test("400 when session id is not a valid 24-hex ObjectId", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/video-sessions/not-valid-id`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(400);
    });
  });

  test("404 when the session does not exist", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      videoSessions: {
        ...createMongoRepositories().videoSessions,
        findById: async () => null
      } as Repositories["videoSessions"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/video-sessions/${sessionId}`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(404);
    });
  });

  test("200 with session DTO when found and owned by the user", async () => {
    const session = stubSession();
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      videoSessions: {
        ...createMongoRepositories().videoSessions,
        findById: async () => session
      } as Repositories["videoSessions"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/video-sessions/${sessionId}`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { session: { id: string } };
      expect(body.session.id).toBe(sessionId);
    });
  });
});

// ---------------------------------------------------------------------------
// Admin routes — GET /api/admin/video-sessions
// ---------------------------------------------------------------------------

describe("GET /api/admin/video-sessions", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/video-sessions`);
      expect(res.status).toBe(401);
    });
  });

  test("403 when the authenticated user lacks an agent role", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser({ id: agentId, role: "user" })
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl, "/issue-agent");
      const res = await fetch(`${baseUrl}/api/admin/video-sessions`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(403);
    });
  });

  test("200 with sessions array for a support_agent", async () => {
    const session = stubSession();
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async (id) =>
          stubUser({ id, role: "support_agent" }),
        findManyByIds: async () => []
      } as Repositories["users"],
      videoSessions: {
        ...createMongoRepositories().videoSessions,
        listForAgentQueue: async () => [session]
      } as Repositories["videoSessions"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl, "/issue-agent");
      const res = await fetch(`${baseUrl}/api/admin/video-sessions`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: unknown[] };
      expect(Array.isArray(body.sessions)).toBe(true);
    });
  });
});
