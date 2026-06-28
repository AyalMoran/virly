import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { setRepositories } from "../../repositories/index.js";
import type {
  Repositories,
  PersonalDetailsRecord,
  PublicUserRecord,
  TransactionRecord
} from "../../repositories/types.js";
import userRoutes from "../user.routes.js";
import { setAuthCookies } from "../../utils/session.js";

setRepositories(createMongoRepositories());

const userId = "507f1f77bcf86cd799439011";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function stubUser(overrides: Partial<PublicUserRecord> = {}): PublicUserRecord {
  return {
    id: userId,
    email: "alice@example.com",
    phone: "+972500000000",
    isVerified: true,
    balance: 250,
    role: "user",
    personalDetails: "507f191e810c19729de860ea",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function stubDetails(overrides: Partial<PersonalDetailsRecord> = {}): PersonalDetailsRecord {
  return {
    id: "507f191e810c19729de860ea",
    userId,
    status: "not_provided",
    firstName: "Alice",
    lastName: "Tester",
    dateOfBirth: new Date("1990-01-01"),
    address: {
      country: "IL",
      city: "Tel Aviv",
      street: "123 Main St",
      postalCode: "61000",
      stateRegion: null,
      addressLine2: null
    },
    lastSkippedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function stubTransaction(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: "tx-1",
    ownerId: userId,
    counterpartyEmail: "bob@example.com",
    amount: 50,
    type: "debit",
    directionLabel: "To bob@example.com",
    reason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function patchRepos(overrides: Partial<Repositories>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, ...overrides });
  cleanups.push(() => setRepositories(base));
}

// ---------------------------------------------------------------------------
// withServer
// ---------------------------------------------------------------------------

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());

  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, userId);
    return res.json({ csrfToken });
  });

  app.use("/api/users", userRoutes);
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
  const res = await fetch(`${baseUrl}/issue`, { method: "POST" });
  const cookie = getSetCookieHeaders(res)
    .map((h) => h.split(";")[0])
    .join("; ");
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { cookie, csrfToken };
}

// ---------------------------------------------------------------------------
// GET /api/users/me
// ---------------------------------------------------------------------------

describe("GET /api/users/me", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/users/me`);
      expect(res.status).toBe(401);
    });
  });

  test("200 with balance, personalDetails, transactions and pagination", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      personalDetails: {
        ...createMongoRepositories().personalDetails,
        ensureForUser: async () => stubDetails(),
        findByUserId: async () => stubDetails()
      } as Repositories["personalDetails"],
      transactions: {
        ...createMongoRepositories().transactions,
        listForOwner: async () => ({
          transactions: [stubTransaction()],
          total: 1
        })
      } as Repositories["transactions"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/users/me`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        balance: number;
        personalDetails: { status: string };
        transactions: unknown[];
        pagination: { total: number };
      };
      expect(body.balance).toBe(250);
      expect(body.personalDetails.status).toBe("not_provided");
      expect(Array.isArray(body.transactions)).toBe(true);
      expect(body.transactions).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });
  });

  test("needsPersonalDetails is false when status is provided", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      personalDetails: {
        ...createMongoRepositories().personalDetails,
        ensureForUser: async () => stubDetails({ status: "provided" }),
        findByUserId: async () => stubDetails({ status: "provided" })
      } as Repositories["personalDetails"],
      transactions: {
        ...createMongoRepositories().transactions,
        listForOwner: async () => ({ transactions: [], total: 0 })
      } as Repositories["transactions"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/users/me`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        personalDetails: { needsPersonalDetails: boolean };
      };
      expect(body.personalDetails.needsPersonalDetails).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/personal-details
// ---------------------------------------------------------------------------

describe("GET /api/users/personal-details", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/users/personal-details`);
      expect(res.status).toBe(401);
    });
  });

  test("200 with full personal details DTO", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      personalDetails: {
        ...createMongoRepositories().personalDetails,
        ensureForUser: async () => stubDetails(),
        findByUserId: async () => stubDetails()
      } as Repositories["personalDetails"]
    });

    await withServer(async (baseUrl) => {
      const { cookie } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/users/personal-details`, {
        headers: { Cookie: cookie }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        personalDetails: { firstName: string; lastName: string };
      };
      expect(body.personalDetails.firstName).toBe("Alice");
      expect(body.personalDetails.lastName).toBe("Tester");
    });
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/personal-details
// ---------------------------------------------------------------------------

describe("PUT /api/users/personal-details", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/users/personal-details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(401);
    });
  });

  test("400 on a missing required field (firstName)", async () => {
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"]
    });

    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/users/personal-details`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          lastName: "Tester",
          dateOfBirth: "1990-01-01",
          address: {
            country: "IL",
            city: "Tel Aviv",
            street: "123 Main St",
            postalCode: "61000"
          }
        })
      });
      expect(res.status).toBe(400);
    });
  });

  test("200 with updated personal details DTO on a valid payload", async () => {
    const updatedDetails = stubDetails({ status: "provided", firstName: "Bob" });
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      personalDetails: {
        ...createMongoRepositories().personalDetails,
        ensureForUser: async () => stubDetails(),
        findByUserId: async () => stubDetails(),
        update: async () => updatedDetails
      } as Repositories["personalDetails"]
    });

    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/users/personal-details`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          firstName: "Bob",
          lastName: "Tester",
          dateOfBirth: "1990-01-01",
          address: {
            country: "IL",
            city: "Tel Aviv",
            street: "123 Main St",
            postalCode: "61000"
          }
        })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        personalDetails: { firstName: string };
      };
      expect(body.personalDetails.firstName).toBe("Bob");
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/personal-details/skip
// ---------------------------------------------------------------------------

describe("POST /api/users/personal-details/skip", () => {
  test("401 when not authenticated", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/users/personal-details/skip`, {
        method: "POST"
      });
      expect(res.status).toBe(401);
    });
  });

  test("200 with skipped message and DTO", async () => {
    const skippedDetails = stubDetails({ status: "not_provided", lastSkippedAt: new Date() });
    patchRepos({
      users: {
        ...createMongoRepositories().users,
        findByIdSafe: async () => stubUser()
      } as Repositories["users"],
      personalDetails: {
        ...createMongoRepositories().personalDetails,
        ensureForUser: async () => stubDetails(),
        findByUserId: async () => stubDetails(),
        markSkipped: async () => skippedDetails,
        update: async () => skippedDetails
      } as Repositories["personalDetails"]
    });

    await withServer(async (baseUrl) => {
      const { cookie, csrfToken } = await issueAuth(baseUrl);
      const res = await fetch(`${baseUrl}/api/users/personal-details/skip`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken }
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { message: string; personalDetails: unknown };
      expect(body.message).toMatch(/skipped/i);
      expect(body.personalDetails).toBeDefined();
    });
  });
});
