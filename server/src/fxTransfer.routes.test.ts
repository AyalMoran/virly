import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import mongoose from "mongoose";
import { parseCookies } from "./middleware/cookies.js";
import { errorHandler } from "./middleware/error-handler.js";
import { ExchangeRate } from "./models/ExchangeRate.js";
import { Transaction } from "./models/Transaction.js";
import { User } from "./models/User.js";
import { createMongoRepositories } from "./repositories/mongo/index.js";
import { setRepositories } from "./repositories/index.js";
import transactionRoutes from "./routes/transaction.routes.js";
import { utcDateKey } from "./services/fx.service.js";
import { setAuthCookies } from "./utils/session.js";

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

function patchExchangeRateFindOne(t: test.TestContext, doc: unknown) {
  patchModel(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => {
      const chain = {
        sort: () => chain,
        lean: async () => doc
      };
      return chain;
    }) as unknown as typeof ExchangeRate.findOne,
    t
  );
}

type MockUserDoc = {
  id: string;
  email: string;
  balance: number;
  saved: boolean;
  save: (options?: unknown) => Promise<void>;
};

function createMockUserDoc(id: string, email: string, balance: number): MockUserDoc {
  return {
    id,
    email,
    balance,
    saved: false,
    async save() {
      this.saved = true;
    }
  };
}

function patchTransferModels(
  t: test.TestContext,
  sender: MockUserDoc,
  recipient: MockUserDoc
) {
  patchModel(
    User,
    "findById",
    ((id: unknown) => ({
      session: () => Promise.resolve(String(id) === sender.id ? sender : null)
    })) as unknown as typeof User.findById,
    t
  );
  patchModel(
    User,
    "findOne",
    ((filter: { email?: string }) => ({
      session: () =>
        Promise.resolve(filter.email === recipient.email ? recipient : null)
    })) as unknown as typeof User.findOne,
    t
  );

  const createdDocs: Array<Record<string, unknown>> = [];
  patchModel(
    Transaction,
    "create",
    (async (docs: Array<Record<string, unknown>>) => {
      const created = docs.map((doc, index) => ({
        ...doc,
        _id: `tx-${index + 1}`,
        createdAt: new Date("2026-06-11T10:00:00.000Z")
      }));
      createdDocs.push(...created);
      return created;
    }) as unknown as typeof Transaction.create,
    t
  );

  patchModel(
    mongoose,
    "startSession",
    (async () => ({
      withTransaction: async (fn: () => Promise<void>) => {
        await fn();
      },
      endSession: async () => {}
    })) as unknown as typeof mongoose.startSession,
    t
  );

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
    assert.equal(response.status, 401);
  });
});

test("USD quote converts server-side into the authoritative ILS amount", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions/quote", auth, {
      amount: 50,
      currency: "USD"
    });
    assert.equal(response.status, 200);

    const { quote } = (await response.json()) as { quote: Record<string, unknown> };
    assert.equal(quote.enteredAmount, 50);
    assert.equal(quote.enteredCurrency, "USD");
    assert.equal(quote.amountIls, 185.19);
    assert.equal(quote.rate, usdToIlsRate);
    assert.equal(quote.rateFetchedAt, fetchedAt.toISOString());
    assert.equal(quote.baseCurrency, "ILS");
  });
});

test("ILS quote is an identity quote with no conversion", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions/quote", auth, {
      amount: 120,
      currency: "ILS"
    });
    assert.equal(response.status, 200);

    const { quote } = (await response.json()) as { quote: Record<string, unknown> };
    assert.equal(quote.amountIls, 120);
    assert.equal(quote.rate, 1);
    assert.equal(quote.rateFetchedAt, null);
  });
});

test("quote rejects unsupported currencies with 400", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions/quote", auth, {
      amount: 50,
      currency: "GBP"
    });
    assert.equal(response.status, 400);

    const body = (await response.json()) as { message?: string };
    assert.match(body.message ?? "", /Unsupported currency "GBP"/);
  });
});
//#endregion

//#region Transfer execution with currency
test("USD transfer converts server-side, validates and stores ILS", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);
  const sender = createMockUserDoc(senderId, "sender@example.com", 200);
  const recipient = createMockUserDoc(recipientId, "recipient@example.com", 10);
  const createdDocs = patchTransferModels(t, sender, recipient);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD",
      quote: { rate: usdToIlsRate, fetchedAt: fetchedAt.toISOString() }
    });
    assert.equal(response.status, 201);

    const body = (await response.json()) as {
      newBalance: number;
      transaction: { amount: number; fx?: Record<string, unknown> };
    };

    // 50 USD at 0.27 USD/ILS => 185.19 ILS moved on the ledger.
    assert.equal(body.newBalance, 14.81);
    assert.equal(sender.balance, 14.81);
    assert.equal(recipient.balance, 195.19);
    assert.equal(body.transaction.amount, -185.19);
    assert.deepEqual(body.transaction.fx, {
      enteredCurrency: "USD",
      enteredAmount: 50,
      exchangeRateUsed: usdToIlsRate,
      exchangeRateFetchedAt: fetchedAt.toISOString()
    });

    // Both ledger rows store the ILS amount as the source of truth.
    assert.equal(createdDocs.length, 2);
    for (const doc of createdDocs) {
      assert.equal(doc.amount, 185.19);
      assert.equal(doc.enteredCurrency, "USD");
      assert.equal(doc.enteredAmount, 50);
      assert.equal(doc.exchangeRateUsed, usdToIlsRate);
    }
  });
});

test("USD transfer is rejected when the ILS balance is insufficient", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);
  const sender = createMockUserDoc(senderId, "sender@example.com", 100);
  const recipient = createMockUserDoc(recipientId, "recipient@example.com", 10);
  patchTransferModels(t, sender, recipient);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD",
      quote: { rate: usdToIlsRate, fetchedAt: fetchedAt.toISOString() }
    });

    // 50 USD => 185.19 ILS > 100 ILS balance.
    assert.equal(response.status, 400);
    const body = (await response.json()) as { message?: string };
    assert.match(body.message ?? "", /Insufficient balance/);
    assert.equal(sender.balance, 100);
  });
});

test("ILS transfer keeps the legacy contract and stores no fx metadata", async (t) => {
  const sender = createMockUserDoc(senderId, "sender@example.com", 200);
  const recipient = createMockUserDoc(recipientId, "recipient@example.com", 0);
  const createdDocs = patchTransferModels(t, sender, recipient);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 75.5
    });
    assert.equal(response.status, 201);

    const body = (await response.json()) as {
      newBalance: number;
      transaction: { amount: number; fx?: unknown };
    };
    assert.equal(body.newBalance, 124.5);
    assert.equal(body.transaction.amount, -75.5);
    assert.equal(body.transaction.fx, undefined);
    assert.equal(createdDocs[0]?.enteredCurrency, undefined);
  });
});

test("transfer rejects unsupported currencies with 400", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "BTC"
    });
    assert.equal(response.status, 400);

    const body = (await response.json()) as { message?: string };
    assert.match(body.message ?? "", /Unsupported currency "BTC"/);
  });
});

test("non-ILS transfer without a quote is rejected with 400", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD"
    });
    assert.equal(response.status, 400);

    const body = (await response.json()) as { message?: string; code?: string };
    assert.equal(body.code, "QUOTE_REQUIRED");
  });
});

test("transfer quoted against an older rate is rejected with 409", async (t) => {
  patchExchangeRateFindOne(t, snapshotDoc);

  await withServer(async (baseUrl) => {
    const auth = await issueAuth(baseUrl);
    const response = await postJson(baseUrl, "/api/transactions", auth, {
      recipientEmail: "recipient@example.com",
      amount: 50,
      currency: "USD",
      quote: { rate: 3.6, fetchedAt: "2026-06-10T06:00:00.000Z" }
    });
    assert.equal(response.status, 409);

    const body = (await response.json()) as { message?: string; code?: string };
    assert.equal(body.code, "QUOTE_RATE_CHANGED");
    assert.match(body.message ?? "", /exchange rate has changed/i);
  });
});

test("non-ILS transfer degrades with 503 when no rates are available", async (t) => {
  patchExchangeRateFindOne(t, null);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (url.includes("er-api.com") || url.includes("exchangerate-api.com")) {
      return Promise.reject(new Error("vendor down (test)"));
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  t.after(() => {
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
    assert.equal(response.status, 503);
  });
});
//#endregion
