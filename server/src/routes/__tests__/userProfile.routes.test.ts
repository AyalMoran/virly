import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { Transaction } from "../../models/Transaction.js";
import userProfileRoutes from "../userProfile.routes.js";
import { setAuthCookies } from "../../utils/session.js";
import { getRepositories, setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { PersonalDetailsRecord, Repositories, UserRecord } from "../../repositories/types.js";

const viewerId = "507f1f77bcf86cd799439011";
const viewedId = "507f191e810c19729de860ea";

type MockUser = {
  _id: string;
  id: string;
  email: string;
  isVerified: boolean;
  balance: number;
  passwordHash: string;
  phone: string;
  role: string;
  createdAt: Date;
};

function createMockUser(id: string, email: string, isVerified = true): MockUser {
  return {
    _id: id,
    id,
    email,
    isVerified,
    balance: 1234.56,
    passwordHash: "super-secret-hash",
    phone: "+972500000000",
    role: "user",
    createdAt: new Date("2026-01-15T10:00:00.000Z")
  };
}

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function patchModel<T extends object, K extends keyof T>(
  model: T,
  key: K,
  value: T[K]
) {
  const original = model[key];
  model[key] = value;
  cleanups.push(() => {
    model[key] = original;
  });
}

type TransactionFindMock = {
  calls: unknown[];
  results: unknown[];
};

function patchTransactionFind(results: unknown[]) {
  const mock: TransactionFindMock = { calls: [], results };

  patchModel(
    Transaction,
    "find",
    ((filter: unknown) => {
      mock.calls.push(filter);
      const chain = {
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        session: () => chain,
        lean: async () => mock.results
      };
      return chain;
    }) as unknown as typeof Transaction.find
  );

  return mock;
}

function toUserRecord(user: MockUser): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    phone: user.phone,
    isVerified: user.isVerified,
    personalDetails: null,
    balance: user.balance,
    role: user.role as UserRecord["role"],
    createdAt: user.createdAt,
    updatedAt: user.createdAt
  };
}

// The route now reaches the User store through getRepositories().users, so we
// stub the repository instead of the Mongoose model. Transaction access still
// flows through the Mongoose model (Task 6), so those patches stay.
function patchUsers(users: MockUser[]) {
  const records = users.map(toUserRecord);
  const byId = new Map(records.map((user) => [user.id, user]));
  const byEmail = new Map(records.map((user) => [user.email.toLowerCase(), user]));

  const base = createMongoRepositories();
  setRepositories({
    ...base,
    users: {
      ...base.users,
      findById: async (id: string) => byId.get(id) ?? null,
      findByEmail: async (email: string) => byEmail.get(email.trim().toLowerCase()) ?? null
    } as Repositories["users"]
  });
  cleanups.push(() => {
    setRepositories(base);
  });
}

// The profile route reads display name through getRepositories().personalDetails
// (the seam), so we stub the repository instead of the Mongoose model.
function patchPersonalDetails(
  details: { status: string; firstName?: string | null; lastName?: string | null } | null
) {
  const record: PersonalDetailsRecord | null = details
    ? {
        id: "507f191e810c19729de860ea",
        userId: viewedId,
        status: details.status as PersonalDetailsRecord["status"],
        firstName: details.firstName ?? null,
        lastName: details.lastName ?? null,
        dateOfBirth: null,
        address: {},
        lastSkippedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      }
    : null;
  const current = getRepositories();
  setRepositories({
    ...current,
    personalDetails: {
      ...current.personalDetails,
      findByUserId: async () => record
    } as Repositories["personalDetails"]
  });
  cleanups.push(() => setRepositories(current));
}

function patchAggregate(stats: unknown[]) {
  patchModel(
    Transaction,
    "aggregate",
    (async () => stats) as unknown as typeof Transaction.aggregate
  );
}

function patchCount(total: number) {
  patchModel(
    Transaction,
    "countDocuments",
    (async () => total) as unknown as typeof Transaction.countDocuments
  );
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());
  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, viewerId);
    return res.json({ csrfToken });
  });
  app.use("/api/users", userProfileRoutes);

  const server = await new Promise<http.Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address.");
    }

    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (headers.getSetCookie) {
    return headers.getSetCookie();
  }

  const combinedHeader = response.headers.get("set-cookie");
  return combinedHeader ? combinedHeader.split(/,(?=\s*virly_)/) : [];
}

async function issueAuthCookie(baseUrl: string) {
  const response = await fetch(`${baseUrl}/issue`, { method: "POST" });
  return getSetCookieHeaders(response)
    .map((header) => header.split(";")[0])
    .join("; ");
}

test("profile requires authentication", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/users/${viewedId}/profile`);
    expect(response.status).toBe(401);
  });
});

test("profile returns 404 for unknown user and invalid identifiers", async () => {
  patchUsers([createMockUser(viewerId, "viewer@example.com")]);

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);

    const unknownEmail = await fetch(
      `${baseUrl}/api/users/${encodeURIComponent("ghost@example.com")}/profile`,
      { headers: { Cookie: cookie } }
    );
    expect(unknownEmail.status).toBe(404);

    const invalidIdentifier = await fetch(`${baseUrl}/api/users/not-a-user/profile`, {
      headers: { Cookie: cookie }
    });
    expect(invalidIdentifier.status).toBe(404);
  });
});

test("profile exposes only safe public fields and viewer-relative data", async () => {
  const viewer = createMockUser(viewerId, "viewer@example.com");
  const viewed = createMockUser(viewedId, "daniel@example.com", true);
  patchUsers([viewer, viewed]);
  patchPersonalDetails({
    status: "provided",
    firstName: "Daniel",
    lastName: "Cohen"
  });
  patchAggregate([
    {
      totalSent: 300,
      totalReceived: 120.5,
      transactionCount: 4,
      lastTransactionAt: new Date("2026-06-03T12:00:00.000Z")
    }
  ]);
  patchTransactionFind([
    {
      _id: "tx-1",
      amount: 120,
      type: "debit",
      reason: "Lunch",
      createdAt: new Date("2026-06-03T12:00:00.000Z")
    },
    {
      _id: "tx-2",
      amount: 80,
      type: "credit",
      reason: null,
      createdAt: new Date("2026-06-01T09:00:00.000Z")
    }
  ]);

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/users/${viewedId}/profile`, {
      headers: { Cookie: cookie }
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "recentTransactions",
      "relationship",
      "user"
    ]);
    expect(body.user).toEqual({
      id: viewedId,
      email: "daniel@example.com",
      displayName: "Daniel Cohen",
      isVerified: true,
      memberSince: "2026-01-15T10:00:00.000Z"
    });

    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/passwordHash|super-secret-hash/);
    expect(raw).not.toMatch(/1234\.56/);
    expect(raw).not.toMatch(/\+972500000000/);
    expect(raw).not.toMatch(/"role"/);

    const relationship = body.relationship as Record<string, unknown>;
    expect(relationship.totalSentToUser).toBe(300);
    expect(relationship.totalReceivedFromUser).toBe(120.5);
    expect(relationship.netAmount).toBe(179.5);
    expect(relationship.transactionCount).toBe(4);
    expect(relationship.lastTransactionAt).toBe("2026-06-03T12:00:00.000Z");
    expect(relationship.isVerifiedRecipient).toBe(true);
    expect(relationship.canTransferToUser).toBe(true);
    expect(relationship.relationshipStatus).toBe("verified_recipient");

    const transactions = body.recentTransactions as Array<Record<string, unknown>>;
    expect(transactions.length).toBe(2);
    expect(transactions[0].direction).toBe("sent");
    expect(transactions[0].status).toBe("completed");
    expect(transactions[0].description).toBe("Lunch");
    expect(transactions[1].direction).toBe("received");
  });
});

test("profile reports no_history when there are no shared transactions", async () => {
  const viewer = createMockUser(viewerId, "viewer@example.com");
  const viewed = createMockUser(viewedId, "daniel@example.com", false);
  patchUsers([viewer, viewed]);
  patchPersonalDetails(null);
  patchAggregate([]);
  patchTransactionFind([]);

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/users/${viewedId}/profile`, {
      headers: { Cookie: cookie }
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { displayName: string };
      relationship: Record<string, unknown>;
      recentTransactions: unknown[];
    };

    expect(body.user.displayName).toBe("Daniel");
    expect(body.relationship.totalSentToUser).toBe(0);
    expect(body.relationship.totalReceivedFromUser).toBe(0);
    expect(body.relationship.netAmount).toBe(0);
    expect(body.relationship.transactionCount).toBe(0);
    expect(body.relationship.lastTransactionAt).toBeNull();
    expect(body.relationship.relationshipStatus).toBe("no_history");
    expect(body.recentTransactions).toEqual([]);
  });
});

test("self profile returns self status without relationship metrics", async () => {
  const viewer = createMockUser(viewerId, "viewer@example.com");
  patchUsers([viewer]);
  patchPersonalDetails(null);

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/users/${viewerId}/profile`, {
      headers: { Cookie: cookie }
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      relationship: Record<string, unknown>;
      recentTransactions: unknown[];
    };

    expect(body.relationship.relationshipStatus).toBe("self");
    expect(body.relationship.canTransferToUser).toBe(false);
    expect(body.relationship.transactionCount).toBe(0);
    expect(body.recentTransactions).toEqual([]);
  });
});

test("relationship transactions only query the viewer's shared ledger", async () => {
  const viewer = createMockUser(viewerId, "viewer@example.com");
  const viewed = createMockUser(viewedId, "daniel@example.com");
  patchUsers([viewer, viewed]);
  const findMock = patchTransactionFind([
    {
      _id: "tx-9",
      amount: 55.25,
      type: "credit",
      reason: "Rent split",
      createdAt: new Date("2026-05-20T08:00:00.000Z")
    }
  ]);
  patchCount(12);

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);
    const response = await fetch(
      `${baseUrl}/api/users/${encodeURIComponent("daniel@example.com")}/transactions?page=2&limit=5`,
      { headers: { Cookie: cookie } }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      transactions: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };

    expect(findMock.calls).toStrictEqual([
      { ownerId: viewerId, counterpartyEmail: "daniel@example.com" }
    ]);
    expect(body.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3
    });
    expect(body.transactions[0].direction).toBe("received");
    expect(body.transactions[0].amount).toBe(55.25);
    expect(body.transactions[0].description).toBe("Rent split");
  });
});
