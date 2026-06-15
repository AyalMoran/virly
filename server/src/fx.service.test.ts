import assert from "node:assert/strict";
import test from "node:test";
import {
  FxUnavailableError,
  type FxDeps,
  type FxRates,
  type FxStore,
  type StoredFxSnapshot,
  assertSupportedCurrency,
  convertAmount,
  convertFromIls,
  convertToIls,
  getCurrentRatesWithDeps,
  isSupportedCurrency,
  normalizeProviderRates,
  rateToIls,
  utcDateKey
} from "./services/fx.service.js";

const rates: FxRates = { ILS: 1, USD: 0.27, EUR: 0.25 };

function createMemoryStore(initial: StoredFxSnapshot[] = []) {
  const snapshots = [...initial];

  const store: FxStore = {
    async findByDate(baseCurrency, validForDate) {
      return (
        snapshots.find(
          (snapshot) =>
            snapshot.baseCurrency === baseCurrency &&
            snapshot.validForDate === validForDate
        ) ?? null
      );
    },
    async findLatest(baseCurrency) {
      return (
        [...snapshots]
          .filter((snapshot) => snapshot.baseCurrency === baseCurrency)
          .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())[0] ?? null
      );
    },
    async upsert(snapshot) {
      const index = snapshots.findIndex(
        (existing) =>
          existing.baseCurrency === snapshot.baseCurrency &&
          existing.validForDate === snapshot.validForDate
      );
      if (index >= 0) {
        snapshots[index] = snapshot;
      } else {
        snapshots.push(snapshot);
      }
    }
  };

  return { store, snapshots };
}

function createDeps(overrides: Partial<FxDeps> = {}): FxDeps & {
  fetchCalls: () => number;
} {
  let fetchCallCount = 0;
  const { store } = createMemoryStore();

  const deps: FxDeps = {
    store,
    fetchRates: async () => {
      fetchCallCount += 1;
      return { rates, provider: "exchangerate-api", sourceResponseHash: "hash" };
    },
    now: () => new Date("2026-06-11T08:00:00.000Z"),
    cacheTtlHours: 48,
    ...overrides
  };

  return { ...deps, fetchCalls: () => fetchCallCount };
}

//#region Currency validation
test("supported currencies are ILS, USD, EUR only", () => {
  assert.ok(isSupportedCurrency("ILS"));
  assert.ok(isSupportedCurrency("USD"));
  assert.ok(isSupportedCurrency("EUR"));
  assert.ok(!isSupportedCurrency("GBP"));
  assert.ok(!isSupportedCurrency("ils"));
  assert.ok(!isSupportedCurrency(undefined));
});

test("assertSupportedCurrency rejects unsupported currency with status 400", () => {
  assert.throws(
    () => assertSupportedCurrency("GBP"),
    (error: Error & { status?: number }) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /Unsupported currency "GBP"/);
      return true;
    }
  );
});
//#endregion

//#region Conversion math
test("converts USD to ILS using the daily rate", () => {
  // 50 USD at 0.27 USD per ILS => 50 / 0.27 = 185.185... => 185.19 ILS
  assert.equal(convertToIls(50, "USD", rates), 185.19);
});

test("converts EUR to ILS using the daily rate", () => {
  // 100 EUR at 0.25 EUR per ILS => 400 ILS
  assert.equal(convertToIls(100, "EUR", rates), 400);
});

test("converts ILS to USD and EUR for display", () => {
  assert.equal(convertFromIls(370, "USD", rates), 99.9);
  assert.equal(convertFromIls(370, "EUR", rates), 92.5);
});

test("converting between identical currencies returns the rounded amount", () => {
  assert.equal(convertToIls(12.345, "ILS", rates), 12.35);
  assert.equal(convertAmount(10.1, "USD", "USD", rates), 10.1);
});

test("conversion avoids floating point drift via integer minor units", () => {
  // 0.1 + 0.2 style input: 0.30000000000000004 must behave as 0.30.
  assert.equal(convertToIls(0.1 + 0.2, "ILS", rates), 0.3);
  assert.equal(convertAmount(0.1 + 0.2, "USD", "EUR", rates), 0.28);
});

test("cross conversion USD <-> EUR works through the ILS base", () => {
  assert.equal(convertAmount(27, "USD", "EUR", rates), 25);
  assert.equal(convertAmount(25, "EUR", "USD", rates), 27);
});

test("conversion with missing rate fails with status 503", () => {
  const brokenRates = { ILS: 1, USD: 0, EUR: Number.NaN } as FxRates;
  assert.throws(
    () => convertToIls(10, "USD", brokenRates),
    (error: Error & { status?: number }) => {
      assert.equal(error.status, 503);
      return true;
    }
  );
});

test("rateToIls reports the inverse rate used for small print", () => {
  assert.equal(rateToIls("ILS", rates), 1);
  assert.equal(rateToIls("USD", rates), 3.703704);
  assert.equal(rateToIls("EUR", rates), 4);
});
//#endregion

//#region Provider normalization
test("normalizes provider rates from an ILS base", () => {
  const normalized = normalizeProviderRates("ILS", {
    USD: 0.27,
    EUR: 0.25,
    GBP: 0.21
  });
  assert.deepEqual(normalized, { ILS: 1, USD: 0.27, EUR: 0.25 });
});

test("normalizes provider rates from a non-ILS base into ILS values", () => {
  const normalized = normalizeProviderRates("USD", {
    ILS: 3.7,
    EUR: 0.925,
    USD: 1
  });
  assert.equal(normalized.ILS, 1);
  assert.ok(Math.abs(normalized.USD - 1 / 3.7) < 1e-12);
  assert.ok(Math.abs(normalized.EUR - 0.925 / 3.7) < 1e-12);
});

test("provider normalization fails when ILS rate is missing", () => {
  assert.throws(
    () => normalizeProviderRates("USD", { EUR: 0.9 }),
    /missing a usable ILS rate/
  );
});
//#endregion

//#region Daily cache behaviour
test("fetches from the vendor once and caches the snapshot for the day", async () => {
  const deps = createDeps();

  const first = await getCurrentRatesWithDeps(deps);
  const second = await getCurrentRatesWithDeps(deps);

  assert.equal(deps.fetchCalls(), 1);
  assert.deepEqual(first.rates, rates);
  assert.deepEqual(second.rates, rates);
  assert.equal(first.validForDate, "2026-06-11");
  assert.equal(first.isStale, false);
  assert.equal(second.fetchedAt.toISOString(), first.fetchedAt.toISOString());
});

test("a new day triggers a fresh vendor fetch", async () => {
  let currentTime = new Date("2026-06-11T08:00:00.000Z");
  const deps = createDeps({ now: () => currentTime });

  await getCurrentRatesWithDeps(deps);
  currentTime = new Date("2026-06-12T08:00:00.000Z");
  const next = await getCurrentRatesWithDeps(deps);

  assert.equal(deps.fetchCalls(), 2);
  assert.equal(next.validForDate, "2026-06-12");
  assert.equal(next.isStale, false);
});

test("vendor failure falls back to the latest non-expired cached snapshot", async () => {
  const yesterdaySnapshot: StoredFxSnapshot = {
    baseCurrency: "ILS",
    rates,
    provider: "exchangerate-api",
    fetchedAt: new Date("2026-06-10T07:00:00.000Z"),
    validForDate: "2026-06-10",
    expiresAt: new Date("2026-06-12T07:00:00.000Z"),
    sourceResponseHash: null
  };
  const { store } = createMemoryStore([yesterdaySnapshot]);
  const deps = createDeps({
    store,
    fetchRates: async () => {
      throw new Error("vendor down");
    }
  });

  const snapshot = await getCurrentRatesWithDeps(deps);

  assert.deepEqual(snapshot.rates, rates);
  assert.equal(snapshot.validForDate, "2026-06-10");
  assert.equal(snapshot.isStale, true);
});

test("vendor failure with an expired cache degrades to FxUnavailableError", async () => {
  const expiredSnapshot: StoredFxSnapshot = {
    baseCurrency: "ILS",
    rates,
    provider: "exchangerate-api",
    fetchedAt: new Date("2026-06-01T07:00:00.000Z"),
    validForDate: "2026-06-01",
    expiresAt: new Date("2026-06-03T07:00:00.000Z"),
    sourceResponseHash: null
  };
  const { store } = createMemoryStore([expiredSnapshot]);
  const deps = createDeps({
    store,
    fetchRates: async () => {
      throw new Error("vendor down");
    }
  });

  await assert.rejects(
    () => getCurrentRatesWithDeps(deps),
    (error: FxUnavailableError) => {
      assert.equal(error.status, 503);
      return true;
    }
  );
});

test("vendor failure with no cache at all degrades to FxUnavailableError", async () => {
  const deps = createDeps({
    fetchRates: async () => {
      throw new Error("vendor down");
    }
  });

  await assert.rejects(() => getCurrentRatesWithDeps(deps), FxUnavailableError);
});

test("expired same-day snapshot is refreshed from the vendor", async () => {
  const staleToday: StoredFxSnapshot = {
    baseCurrency: "ILS",
    rates: { ILS: 1, USD: 0.5, EUR: 0.5 },
    provider: "exchangerate-api",
    fetchedAt: new Date("2026-06-11T00:00:00.000Z"),
    validForDate: "2026-06-11",
    expiresAt: new Date("2026-06-11T01:00:00.000Z"),
    sourceResponseHash: null
  };
  const { store } = createMemoryStore([staleToday]);
  const deps = createDeps({ store });

  const snapshot = await getCurrentRatesWithDeps(deps);

  assert.equal(deps.fetchCalls(), 1);
  assert.deepEqual(snapshot.rates, rates);
});

test("utcDateKey derives the YYYY-MM-DD UTC day", () => {
  assert.equal(utcDateKey(new Date("2026-06-11T23:59:59.000Z")), "2026-06-11");
  assert.equal(utcDateKey(new Date("2026-06-12T00:00:00.000Z")), "2026-06-12");
});
//#endregion
