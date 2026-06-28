import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { setRepositories } from "../../repositories/index.js";
import type { Repositories, UserRecord, PersonalDetailsRecord } from "../../repositories/types.js";
import authRoutes from "../auth.routes.js";
import { setAuthCookies } from "../../utils/session.js";
import { AppError } from "../../utils/app-error.js";

// Wire up repositories so service layer can call getRepositories()
setRepositories(createMongoRepositories());

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "507f1f77bcf86cd799439011",
    email: "alice@example.com",
    passwordHash: "$2a$10$placeholder",
    phone: "+972500000000",
    isVerified: true,
    balance: 500,
    role: "user",
    personalDetails: "507f191e810c19729de860ea",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function personalDetailsRecord(): PersonalDetailsRecord {
  return {
    id: "507f191e810c19729de860ea",
    userId: "507f1f77bcf86cd799439011",
    status: "not_provided",
    firstName: "Alice",
    lastName: null,
    dateOfBirth: null,
    address: {},
    lastSkippedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

function patchRepos(overrides: Partial<Repositories>) {
  const base = createMongoRepositories();
  const prev = setRepositories as unknown as { _last?: Repositories };
  const repos = { ...base, ...overrides };
  setRepositories(repos);
  cleanups.push(() => setRepositories(base));
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());

  // Helper endpoint so tests can get auth cookies without going through login
  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, "507f1f77bcf86cd799439011");
    return res.json({ csrfToken });
  });

  app.use("/api/auth", authRoutes);
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

async function issueAuth(baseUrl: string) {
  const response = await fetch(`${baseUrl}/issue`, { method: "POST" });
  const cookie = getSetCookieHeaders(response)
    .map((h) => h.split(";")[0])
    .join("; ");
  const { csrfToken } = (await response.json()) as { csrfToken: string };
  return { cookie, csrfToken };
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  test("400 on missing email", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "password123", phone: "+972500000000" })
      });
      expect(res.status).toBe(400);
    });
  });

  test("400 on password shorter than 8 characters", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "short", phone: "+972500000000" })
      });
      expect(res.status).toBe(400);
    });
  });

  test("400 on invalid phone number format", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "password123", phone: "abc" })
      });
      expect(res.status).toBe(400);
    });
  });

  test("409 when authService.register throws AppError(409) for duplicate email", async () => {
    // Patch users.findByEmail to return an existing user (triggers duplicate detection in service)
    const existing = userRecord();
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByEmail: async () => existing
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "password123",
          phone: "+972500000000"
        })
      });
      expect(res.status).toBe(409);
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify
// ---------------------------------------------------------------------------

describe("GET /api/auth/verify", () => {
  test("400 when token query parameter is missing", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/verify`);
      expect(res.status).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// ---------------------------------------------------------------------------

describe("POST /api/auth/resend-verification", () => {
  test("400 on invalid email", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" })
      });
      expect(res.status).toBe(400);
    });
  });

  test("200 with the expected ambiguous message for any valid email", async () => {
    // Even for an unknown email the message is intentionally the same
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByEmail: async () => null
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.com" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { message: string };
      expect(body.message).toMatch(/verification link/i);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  test("400 on invalid email format", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "bad", password: "pw" })
      });
      expect(res.status).toBe(400);
    });
  });

  test("401 when authService.login throws an AppError(401)", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByEmail: async () => null
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "whatever" })
      });
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe("GET /api/auth/me", () => {
  test("401 when no auth cookie is present", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
    });
  });

  test("200 with user DTO when authenticated", async () => {
    const user = userRecord();
    const details = personalDetailsRecord();
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findById: async () => user,
        findByIdSafe: async () => user
      } as Repositories["users"],
      personalDetails: {
        ...createMongoRepositories().personalDetails,
        ensureForUser: async () => details,
        findByUserId: async () => details
      } as Repositories["personalDetails"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { email: string } };
      expect(body.user.email).toBe("alice@example.com");
    });
  });

  test("404 when user cannot be found", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findById: async () => null,
        findByIdSafe: async () => null
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  test("401 without auth", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
      expect(res.status).toBe(401);
    });
  });

  test("200 with logout message after authenticated logout", async () => {
    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { message: string };
      expect(body.message).toMatch(/logged out/i);
    });
  });
});
