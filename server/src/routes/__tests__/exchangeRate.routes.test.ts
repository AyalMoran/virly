import http from "node:http";
import express from "express";
import { parseCookies } from "../../middleware/cookies.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { ExchangeRate } from "../../models/ExchangeRate.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { setRepositories } from "../../repositories/index.js";
import exchangeRateRoutes from "../exchangeRate.routes.js";
import { utcDateKey } from "../../services/fx.service.js";
import { setAuthCookies } from "../../utils/session.js";

// Ensure the mongo repository seam is wired so defaultDeps() can resolve
// getRepositories(). Individual tests then patch ExchangeRate.findOne as before,
// which flows through the mongoExchangeRateRepository into the service.
setRepositories(createMongoRepositories());

const userId = "507f1f77bcf86cd799439011";

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

function blockProviderFetch() {
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
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(parseCookies);
  app.use(express.json());
  app.post("/issue", (_req, res) => {
    const csrfToken = setAuthCookies(res, userId);
    return res.json({ csrfToken });
  });
  app.use("/api/exchange-rates", exchangeRateRoutes);
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

async function issueAuthCookie(baseUrl: string) {
  const response = await fetch(`${baseUrl}/issue`, { method: "POST" });
  return getSetCookieHeaders(response)
    .map((header) => header.split(";")[0])
    .join("; ");
}

test("exchange rates endpoint requires authentication", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/exchange-rates/current`);
    expect(response.status).toBe(401);
  });
});

test("exchange rates endpoint returns the cached daily ILS snapshot", async () => {
  const today = utcDateKey(new Date());
  patchExchangeRateFindOne({
    baseCurrency: "ILS",
    rates: { ILS: 1, USD: 0.27, EUR: 0.25, GBP: 0.21 },
    provider: "exchangerate-api",
    fetchedAt: new Date("2026-06-11T06:00:00.000Z"),
    validForDate: today,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    sourceResponseHash: "hash"
  });

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/exchange-rates/current`, {
      headers: { Cookie: cookie }
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.baseCurrency).toBe("ILS");
    expect(body.supportedCurrencies).toStrictEqual(["ILS", "USD", "EUR"]);
    // Only the supported currencies are exposed, even if more were cached.
    expect(body.rates).toEqual({ ILS: 1, USD: 0.27, EUR: 0.25 });
    expect(body.provider).toBe("exchangerate-api");
    expect(typeof body.fetchedAt).toBe("string");
    expect(typeof body.expiresAt).toBe("string");
    expect(body.isStale).toBe(false);
  });
});

test("exchange rates endpoint degrades with 503 when no usable rates exist", async () => {
  patchExchangeRateFindOne(null);
  blockProviderFetch();

  await withServer(async (baseUrl) => {
    const cookie = await issueAuthCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/exchange-rates/current`, {
      headers: { Cookie: cookie }
    });
    expect(response.status).toBe(503);

    const body = (await response.json()) as { message?: string };
    expect(body.message ?? "").toMatch(/unavailable/i);
  });
});
