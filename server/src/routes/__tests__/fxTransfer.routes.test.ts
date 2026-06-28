import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { ExchangeRate } from "../../models/ExchangeRate.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { getRepositories, setRepositories } from "../../repositories/index.js";
import type { Repositories } from "../../repositories/types.js";
import transactionRoutes from "../transaction.routes.js";
import { utcDateKey } from "../../services/fx.service.js";
import { executeTransfer } from "../../services/transfer.service.js";
import { AppError } from "../../utils/app-error.js";
import { setAuthCookies } from "../../utils/session.js";

// Ensure the mongo repository seam is wired so defaultDeps() can resolve
// getRepositories(). Individual tests then patch ExchangeRate.findOne as before,
// which flows through the mongoExchangeRateRepository into the service.
setRepositories(createMongoRepositories());

const senderId = "507f1f77bcf86cd799439011";
const recipientId = "507f191e810c19729de860ea";

const fetchedAt = new Date("2026-06-11T06:00:00.000Z");
// 0.27 USD and 0.25 EUR per 1 ILS.
const snapshotDoc = {
  baseCurrency: "ILS",
  rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
  provider: "exchangerate-api",
  fetchedAt,
  validForDate: utcDateKey(new Date()),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  sourceResponseHash: "hash"
};
const usdToIlsRate = 3.703704;

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

function patchExchangeRateFindOne(doc: unknown) {
  patchModel(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => {
      const chain = {
        sort: () => chain,
        lean: async () => doc
      };
      return chain;
    }) as unknown as typeof ExchangeRate.findOne
  );
}

type MockUserDoc = {
  id: string;
  email: string;
  balance: number;
};

function createMockUserDoc(id: string, email: string, balance: number): MockUserDoc {
  return {
    id,
    email,
    balance
  };
}

/**
 * Swap the repository seam so the transfer settlement path
 * (`executeTransfer` → `runInTransaction` → repos) runs against in-memory
 * mocks. `runInTransaction` runs the body with a dummy tx; `setBalance` mutates
 * the captured mock docs (so tests can assert final balances), and
 * `createMany` records the ledger entries it was handed and returns them as
 * `TransactionRecord`s. Restores the previous repositories on teardown.
 */
function patchTransferModels(
  sender: MockUserDoc,
  recipient: MockUserDoc
) {
  const previous = getRepositories();
  cleanups.push(() => setRepositories(previous));

  const base = createMongoRepositories();
  const createdDocs: Array<Record<string, unknown>> = [];

  setRepositories({
    ...base,
    runInTransaction: async (fn) => fn({}),
    users: {
      ...base.users,
      findById: async (id) =>
        (String(id) === sender.id
          ? ({ ...sender, role: "user" } as unknown)
          : null) as never,
      findByEmail: async (email) =>
        (email.toLowerCase() === recipient.email.toLowerCase()
          ? ({ ...recipient, role: "user" } as unknown)
          : null) as never,
      setBalance: async (id, balance) => {
        if (id === sender.id) sender.balance = balance;
        if (id === recipient.id) recipient.balance = balance;
      }
    },
    transactions: {
      ...base.transactions,
      createMany: async (entries) => {
        const created = entries.map((entry, index) => ({
          ...entry,
          id: `tx-${index + 1}`,
          createdAt: new Date("2026-06-11T10:00:00.000Z"),
          updatedAt: new Date("2026-06-11T10:00:00.000Z")
        }));
        createdDocs.push(...created);
        return created as never;
      },
      // Stub out fraud-scoring reads so the post-commit recordTransferRiskFlag
      // does not fall through to MongoDB (which would add ~10 s per test).
      hasDebitToCounterparty: async () => true,
      getDailyDebitUsage: async () => ({ total: 0, count: 0 }),
      recentForOwner: async () => []
    }
  } as Repositories);

  return createdDocs;
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());
  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, senderId);
    return res.json({ csrfToken });
  });
  app.use("/api/transactions", transactionRoutes);
  app.use(errorHandler);

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

async function issueAuth(baseUrl: string) {
  const response = await fetch(`${baseUrl}/issue`, { method: "POST" });
  const cookie = getSetCookieHeaders(response)
    .map((header) => header.split(";")[0])
    .join("; ");
  const { csrfToken } = (await response.json()) as { csrfToken: string };
  return { cookie, csrfToken };
}

async function postJson(
  baseUrl: string,
  path: string,
  auth: { cookie: string; csrfToken: string },
  body: unknown
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

//#region Quote endpoint
test("quote endpoint requires authentication", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/transactions/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 50, currency: "USD" })
    });
    expect(response.status).toBe(401);
  });
});

test("USD quote converts server-side into the authoritative ILS amount", async () => {
  patchExchangeRateFindOne(snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions/quote", auth, {
      amount: 50,
      currency: "USD"
    });
    expect(response.status).toBe(200);

    const { quote } = (await response.json()) as { quote: Record<string, unknown> };
    expect(quote.enteredAmount).toBe(50);
    expect(quote.enteredCurrency).toBe("USD");
    expect(quote.amountIls).toBe(185.19);
    expect(quote.rate).toBe(usdToIlsRate);
    expect(quote.rateFetchedAt).toBe(fetchedAt.toISOString());
    expect(quote.baseCurrency).toBe("ILS");
  });
});

test("ILS quote is an identity quote with no conversion", async () => {
  patchExchangeRateFindOne(snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions/quote", auth, {
      amount: 120,
      currency: "ILS"
    });
    expect(response.status).toBe(200);

    const { quote } = (await response.json()) as { quote: Record<string, unknown> };
    expect(quote.amountIls).toBe(120);
    expect(quote.rate).toBe(1);
    expect(quote.rateFetchedAt).toBeNull();
  });
});

test("quote rejects unsupported currencies with 400", async () => {
  patchExchangeRateFindOne(snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions/quote", auth, {
      amount: 50,
      currency: "GBP"
    });
    expect(response.status).toBe(400);

    const body = (await response.json()) as { message?: string };
    expect(body.message ?? "").toMatch(/Unsupported currency "GBP"/);
  });
});
//#endregion

//#region Transfer execution with currency
test("USD transfer converts server-side, validates and stores ILS", async () => {
  patchExchangeRateFindOne(snapshotDoc);
  const sender = createMockUserDoc(senderId, "sender@example.com", 200);
  const recipient = createMockUserDoc(recipientId, "recipient@example.com", 10);
  const createdDocs = patchTransferModels(sender, recipient);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD",
      quote: { rate: usdToIlsRate, fetchedAt: fetchedAt.toISOString() }
    });
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      newBalance: number;
      transaction: { amount: number; fx?: Record<string, unknown> };
    };

    // 50 USD at 0.27 USD/ILS => 185.19 ILS moved on the ledger.
    expect(body.newBalance).toBe(14.81);
    expect(sender.balance).toBe(14.81);
    expect(recipient.balance).toBe(195.19);
    expect(body.transaction.amount).toBe(-185.19);
    expect(body.transaction.fx).toEqual({
      enteredCurrency: "USD",
      enteredAmount: 50,
      exchangeRateUsed: usdToIlsRate,
      exchangeRateFetchedAt: fetchedAt.toISOString()
    });

    // Both ledger rows store the ILS amount as the source of truth.
    expect(createdDocs.length).toBe(2);
    for (const doc of createdDocs) {
      expect(doc.amount).toBe(185.19);
      expect(doc.enteredCurrency).toBe("USD");
      expect(doc.enteredAmount).toBe(50);
      expect(doc.exchangeRateUsed).toBe(usdToIlsRate);
    }
  });
});

test("USD transfer is rejected when the ILS balance is insufficient", async () => {
  patchExchangeRateFindOne(snapshotDoc);
  const sender = createMockUserDoc(senderId, "sender@example.com", 100);
  const recipient = createMockUserDoc(recipientId, "recipient@example.com", 10);
  patchTransferModels(sender, recipient);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD",
      quote: { rate: usdToIlsRate, fetchedAt: fetchedAt.toISOString() }
    });

    // 50 USD => 185.19 ILS > 100 ILS balance.
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message?: string };
    expect(body.message ?? "").toMatch(/Insufficient balance/);
    expect(sender.balance).toBe(100);
  });
});

test("ILS transfer keeps the legacy contract and stores no fx metadata", async () => {
  const sender = createMockUserDoc(senderId, "sender@example.com", 200);
  const recipient = createMockUserDoc(recipientId, "recipient@example.com", 0);
  const createdDocs = patchTransferModels(sender, recipient);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 75.5
    });
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      newBalance: number;
      transaction: { amount: number; fx?: unknown };
    };
    expect(body.newBalance).toBe(124.5);
    expect(body.transaction.amount).toBe(-75.5);
    expect(body.transaction.fx).toBeUndefined();
    expect(createdDocs[0]?.enteredCurrency).toBeUndefined();
  });
});

test("transfer rejects unsupported currencies with 400", async () => {
  patchExchangeRateFindOne(snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "BTC"
    });
    expect(response.status).toBe(400);

    const body = (await response.json()) as { message?: string };
    expect(body.message ?? "").toMatch(/Unsupported currency "BTC"/);
  });
});

test("non-ILS transfer without a quote is rejected with 400", async () => {
  patchExchangeRateFindOne(snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD"
    });
    expect(response.status).toBe(400);

    const body = (await response.json()) as { message?: string; code?: string };
    expect(body.code).toBe("QUOTE_REQUIRED");
  });
});

test("transfer quoted against an older rate is rejected with 409", async () => {
  patchExchangeRateFindOne(snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD",
      quote: { rate: 3.6, fetchedAt: "2026-06-10T06:00:00.000Z" }
    });
    expect(response.status).toBe(409);

    const body = (await response.json()) as { message?: string; code?: string };
    expect(body.code).toBe("QUOTE_RATE_CHANGED");
    expect(body.message ?? "").toMatch(/exchange rate has changed/i);
  });
});

test("non-ILS transfer degrades with 503 when no rates are available", async () => {
  patchExchangeRateFindOne(null);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (url.includes("er-api.com") || url.includes("exchangerate-api.com")) {
      return Promise.reject(new Error("vendor down (test)"));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  cleanups.push(() => {
    globalThis.fetch = originalFetch;
  });

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "EUR",
      quote: { rate: 4, fetchedAt: fetchedAt.toISOString() }
    });
    expect(response.status).toBe(503);
  });
});
//#endregion

//#region executeTransfer settlement on runInTransaction
test("executeTransfer rejects on insufficient balance without writing", async () => {
  const original = getRepositories();
  cleanups.push(() => setRepositories(original));

  const base = createMongoRepositories();
  let setBalanceCalls = 0;
  setRepositories({
    ...base,
    runInTransaction: async (fn) => fn({}),
    users: {
      ...base.users,
      findById: async () =>
        ({ id: "s", email: "s@x.com", balance: 5, role: "user" } as never),
      findByEmail: async () =>
        ({ id: "r", email: "r@x.com", balance: 0, role: "user" } as never),
      setBalance: async () => {
        setBalanceCalls++;
      }
    },
    transactions: {
      ...base.transactions,
      createMany: async () => {
        throw new Error("should not insert");
      }
    }
  } as Repositories);

  const err = await executeTransfer({ senderId: "s", recipientEmail: "r@x.com", amount: 100 }).then(
    () => null,
    (e) => e
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
  expect((err as AppError).message).toMatch(/Insufficient balance/);
  expect(setBalanceCalls).toBe(0);
});
//#endregion
