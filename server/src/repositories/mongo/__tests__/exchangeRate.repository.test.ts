

// src/repositories/mongo/exchangeRate.repository.test.ts
import { ExchangeRate } from "../../../models/ExchangeRate.js";
import { mongoExchangeRateRepository } from "../exchangeRate.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k]; o[k] = v; cleanups.push(() => { o[k] = orig; });
}

const RATE_OID = "60d5ec49f1b2c8a1f8e4e1a1";

const leanRate = {
  _id: RATE_OID,
  baseCurrency: "ILS",
  rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
  provider: "exchangerate-api",
  fetchedAt: new Date("2026-06-22T08:00:00.000Z"),
  validForDate: "2026-06-22",
  expiresAt: new Date("2026-06-24T08:00:00.000Z"),
  sourceResponseHash: "abc123",
  createdAt: new Date("2026-06-22T08:00:00.000Z"),
  updatedAt: new Date("2026-06-22T08:00:00.000Z")
};

// ---------------------------------------------------------------------------
// latestForBase
// ---------------------------------------------------------------------------

test("latestForBase: maps lean doc to ExchangeRateRecord with string id", async () => {
  const fakeChain = { sort: () => fakeChain, lean: async () => leanRate };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne
  );

  const rec = await mongoExchangeRateRepository.latestForBase("ILS");

  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(RATE_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec!.baseCurrency).toBe("ILS");
  expect(rec!.rates).toStrictEqual({ ILS: 1, USD: 0.27, EUR: 0.25 });
  expect(rec!.provider).toBe("exchangerate-api");
  expect(rec!.validForDate).toBe("2026-06-22");
  expect(rec!.sourceResponseHash === "abc123").toBeTruthy();
  expect(rec!.createdAt).toBeInstanceOf(Date);
  expect(rec!.updatedAt).toBeInstanceOf(Date);
});

test("latestForBase: returns null when no document found", async () => {
  const fakeChain = { sort: () => fakeChain, lean: async () => null };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne
  );

  const rec = await mongoExchangeRateRepository.latestForBase("ILS");
  expect(rec).toBeNull();
});

test("latestForBase: queries by baseCurrency and sorts by fetchedAt desc", async () => {
  let capturedFilter: unknown;
  let capturedSort: unknown;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    lean: async () => null
  };
  patch(
    ExchangeRate,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof ExchangeRate.findOne
  );

  await mongoExchangeRateRepository.latestForBase("ILS");
  expect(capturedFilter).toStrictEqual({ baseCurrency: "ILS" });
  expect(capturedSort).toStrictEqual({ fetchedAt: -1 });
});

test("latestForBase: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedSession: unknown;
  const fakeChain = {
    session: (s: unknown) => { capturedSession = s; return fakeChain; },
    sort: () => fakeChain,
    lean: async () => null
  };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne
  );

  await mongoExchangeRateRepository.latestForBase("ILS", fakeSession);
  expect(capturedSession).toBe(fakeSession);
});

// ---------------------------------------------------------------------------
// findForDate
// ---------------------------------------------------------------------------

test("findForDate: queries by baseCurrency and validForDate, sorts by fetchedAt desc", async () => {
  let capturedFilter: unknown;
  let capturedSort: unknown;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    lean: async () => leanRate
  };
  patch(
    ExchangeRate,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof ExchangeRate.findOne
  );

  const rec = await mongoExchangeRateRepository.findForDate("ILS", "2026-06-22");

  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(RATE_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(capturedFilter).toStrictEqual({ baseCurrency: "ILS", validForDate: "2026-06-22" });
  expect(capturedSort).toStrictEqual({ fetchedAt: -1 });
});

test("findForDate: returns null when no document found", async () => {
  const fakeChain = { sort: () => fakeChain, lean: async () => null };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne
  );

  const rec = await mongoExchangeRateRepository.findForDate("ILS", "2026-06-22");
  expect(rec).toBeNull();
});

test("findForDate: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedSession: unknown;
  const fakeChain = {
    session: (s: unknown) => { capturedSession = s; return fakeChain; },
    sort: () => fakeChain,
    lean: async () => null
  };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne
  );

  await mongoExchangeRateRepository.findForDate("ILS", "2026-06-22", fakeSession);
  expect(capturedSession).toBe(fakeSession);
});

// ---------------------------------------------------------------------------
// upsertForDate
// ---------------------------------------------------------------------------

test("upsertForDate: calls updateOne with correct filter, $set, and upsert option", async () => {
  let capturedFilter: unknown;
  let capturedUpdate: unknown;
  let capturedOpts: unknown;

  const returnedDoc = { ...leanRate, toObject: () => leanRate };
  patch(
    ExchangeRate,
    "findOneAndUpdate",
    (async (filter: unknown, update: unknown, opts: unknown) => {
      capturedFilter = filter;
      capturedUpdate = update;
      capturedOpts = opts;
      return returnedDoc;
    }) as unknown as typeof ExchangeRate.findOneAndUpdate
  );

  const input = {
    baseCurrency: "ILS" as const,
    rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
    provider: "exchangerate-api",
    fetchedAt: new Date("2026-06-22T08:00:00.000Z"),
    validForDate: "2026-06-22",
    expiresAt: new Date("2026-06-24T08:00:00.000Z"),
    sourceResponseHash: "abc123"
  };

  const rec = await mongoExchangeRateRepository.upsertForDate(input);

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(RATE_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(capturedFilter).toStrictEqual({ baseCurrency: "ILS", validForDate: "2026-06-22" });
  expect((capturedUpdate as Record<string, unknown>).$set).toBeTruthy();
  expect((capturedOpts as Record<string, unknown>).upsert).toBe(true);
  expect((capturedOpts as Record<string, unknown>).new).toBe(true);
});

test("upsertForDate: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanRate, toObject: () => leanRate };
  patch(
    ExchangeRate,
    "findOneAndUpdate",
    (async (_f: unknown, _u: unknown, opts: unknown) => {
      capturedOpts = opts;
      return returnedDoc;
    }) as unknown as typeof ExchangeRate.findOneAndUpdate
  );

  await mongoExchangeRateRepository.upsertForDate(
    {
      baseCurrency: "ILS",
      rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
      provider: "exchangerate-api",
      fetchedAt: new Date("2026-06-22T08:00:00.000Z"),
      validForDate: "2026-06-22",
      expiresAt: new Date("2026-06-24T08:00:00.000Z"),
      sourceResponseHash: null
    },
    fakeSession
  );

  expect((capturedOpts as Record<string, unknown>).session).toBe(fakeSession);
});

test("upsertForDate: sourceResponseHash is preserved as null", async () => {
  let capturedUpdate: unknown;
  const nullHashLean = { ...leanRate, sourceResponseHash: null };
  const returnedDoc = { ...nullHashLean, toObject: () => nullHashLean };

  patch(
    ExchangeRate,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof ExchangeRate.findOneAndUpdate
  );

  const rec = await mongoExchangeRateRepository.upsertForDate({
    baseCurrency: "ILS",
    rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
    provider: "exchangerate-api",
    fetchedAt: new Date("2026-06-22T08:00:00.000Z"),
    validForDate: "2026-06-22",
    expiresAt: new Date("2026-06-24T08:00:00.000Z"),
    sourceResponseHash: null
  });

  expect(rec.sourceResponseHash).toBeNull();
  const setClause = (capturedUpdate as { $set?: Record<string, unknown> }).$set ?? {};
  expect(setClause.sourceResponseHash).toBeNull();
});
