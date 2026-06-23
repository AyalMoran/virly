

// src/repositories/mongo/exchangeRate.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { ExchangeRate } from "../../models/ExchangeRate.js";
import { mongoExchangeRateRepository } from "./exchangeRate.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k]; o[k] = v; t.after(() => { o[k] = orig; });
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

test("latestForBase: maps lean doc to ExchangeRateRecord with string id", async (t) => {
  const fakeChain = {
    sort: () => fakeChain,
    lean: async () => leanRate
  };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne,
    t
  );

  const rec = await mongoExchangeRateRepository.latestForBase("ILS");

  assert.ok(rec);
  assert.equal(rec.id, RATE_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined, "must not expose _id");
  assert.equal(rec.baseCurrency, "ILS");
  assert.deepEqual(rec.rates, { ILS: 1, USD: 0.27, EUR: 0.25 });
  assert.equal(rec.provider, "exchangerate-api");
  assert.equal(rec.validForDate, "2026-06-22");
  assert.ok(rec.sourceResponseHash === "abc123");
  assert.ok(rec.createdAt instanceof Date);
  assert.ok(rec.updatedAt instanceof Date);
});

test("latestForBase: returns null when no document found", async (t) => {
  const fakeChain = { sort: () => fakeChain, lean: async () => null };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne,
    t
  );

  const rec = await mongoExchangeRateRepository.latestForBase("ILS");
  assert.equal(rec, null);
});

test("latestForBase: queries by baseCurrency and sorts by fetchedAt desc", async (t) => {
  let capturedFilter: unknown;
  let capturedSort: unknown;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    lean: async () => null
  };
  patch(
    ExchangeRate,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof ExchangeRate.findOne,
    t
  );

  await mongoExchangeRateRepository.latestForBase("ILS");
  assert.deepEqual(capturedFilter, { baseCurrency: "ILS" });
  assert.deepEqual(capturedSort, { fetchedAt: -1 });
});

test("latestForBase: passes session when tx context is provided", async (t) => {
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
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne,
    t
  );

  await mongoExchangeRateRepository.latestForBase("ILS", fakeSession);
  assert.equal(capturedSession, fakeSession);
});

// ---------------------------------------------------------------------------
// findForDate
// ---------------------------------------------------------------------------

test("findForDate: queries by baseCurrency and validForDate, sorts by fetchedAt desc", async (t) => {
  let capturedFilter: unknown;
  let capturedSort: unknown;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    lean: async () => leanRate
  };
  patch(
    ExchangeRate,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof ExchangeRate.findOne,
    t
  );

  const rec = await mongoExchangeRateRepository.findForDate("ILS", "2026-06-22");

  assert.ok(rec);
  assert.equal(rec.id, RATE_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined);
  assert.deepEqual(capturedFilter, { baseCurrency: "ILS", validForDate: "2026-06-22" });
  assert.deepEqual(capturedSort, { fetchedAt: -1 });
});

test("findForDate: returns null when no document found", async (t) => {
  const fakeChain = { sort: () => fakeChain, lean: async () => null };
  patch(
    ExchangeRate,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne,
    t
  );

  const rec = await mongoExchangeRateRepository.findForDate("ILS", "2026-06-22");
  assert.equal(rec, null);
});

test("findForDate: passes session when tx context is provided", async (t) => {
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
    ((_filter: unknown) => fakeChain) as unknown as typeof ExchangeRate.findOne,
    t
  );

  await mongoExchangeRateRepository.findForDate("ILS", "2026-06-22", fakeSession);
  assert.equal(capturedSession, fakeSession);
});

// ---------------------------------------------------------------------------
// upsertForDate
// ---------------------------------------------------------------------------

test("upsertForDate: calls updateOne with correct filter, $set, and upsert option", async (t) => {
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
    }) as unknown as typeof ExchangeRate.findOneAndUpdate,
    t
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

  assert.ok(rec);
  assert.equal(rec.id, RATE_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined);
  assert.deepEqual(capturedFilter, { baseCurrency: "ILS", validForDate: "2026-06-22" });
  assert.ok((capturedUpdate as Record<string, unknown>).$set, "update must use $set");
  assert.ok((capturedOpts as Record<string, unknown>).upsert === true, "must use upsert: true");
  assert.ok((capturedOpts as Record<string, unknown>).new === true, "must use new: true");
});

test("upsertForDate: passes session when tx context is provided", async (t) => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanRate, toObject: () => leanRate };
  patch(
    ExchangeRate,
    "findOneAndUpdate",
    (async (_f: unknown, _u: unknown, opts: unknown) => {
      capturedOpts = opts;
      return returnedDoc;
    }) as unknown as typeof ExchangeRate.findOneAndUpdate,
    t
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

  assert.equal((capturedOpts as Record<string, unknown>).session, fakeSession);
});

test("upsertForDate: sourceResponseHash is preserved as null", async (t) => {
  let capturedUpdate: unknown;
  const nullHashLean = { ...leanRate, sourceResponseHash: null };
  const returnedDoc = { ...nullHashLean, toObject: () => nullHashLean };

  patch(
    ExchangeRate,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof ExchangeRate.findOneAndUpdate,
    t
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

  assert.equal(rec.sourceResponseHash, null);
  const setClause = (capturedUpdate as { $set?: Record<string, unknown> }).$set ?? {};
  assert.equal(setClause.sourceResponseHash, null);
});
