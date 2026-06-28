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
} from "../fx.service.js";

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
  expect(isSupportedCurrency("ILS")).toBeTruthy();
  expect(isSupportedCurrency("USD")).toBeTruthy();
  expect(isSupportedCurrency("EUR")).toBeTruthy();
  expect(isSupportedCurrency("GBP")).toBeFalsy();
  expect(isSupportedCurrency("ils")).toBeFalsy();
  expect(isSupportedCurrency(undefined)).toBeFalsy();
});

test("assertSupportedCurrency rejects unsupported currency with status 400", () => {
  let err: Error & { status?: number } | undefined;
  try {
    assertSupportedCurrency("GBP");
  } catch (e) {
    err = e as Error & { status?: number };
  }
  expect(err!.status).toBe(400);
  expect(err!.message).toMatch(/Unsupported currency "GBP"/);
});
//#endregion

//#region Conversion math
test("converts USD to ILS using the daily rate", () => {
  // 50 USD at 0.27 USD per ILS => 50 / 0.27 = 185.185... => 185.19 ILS
  expect(convertToIls(50, "USD", rates)).toBe(185.19);
});

test("converts EUR to ILS using the daily rate", () => {
  // 100 EUR at 0.25 EUR per ILS => 400 ILS
  expect(convertToIls(100, "EUR", rates)).toBe(400);
});

test("converts ILS to USD and EUR for display", () => {
  expect(convertFromIls(370, "USD", rates)).toBe(99.9);
  expect(convertFromIls(370, "EUR", rates)).toBe(92.5);
});

test("converting between identical currencies returns the rounded amount", () => {
  expect(convertToIls(12.345, "ILS", rates)).toBe(12.35);
  expect(convertAmount(10.1, "USD", "USD", rates)).toBe(10.1);
});

test("conversion avoids floating point drift via integer minor units", () => {
  // 0.1 + 0.2 style input: 0.30000000000000004 must behave as 0.30.
  expect(convertToIls(0.1 + 0.2, "ILS", rates)).toBe(0.3);
  expect(convertAmount(0.1 + 0.2, "USD", "EUR", rates)).toBe(0.28);
});

test("cross conversion USD <-> EUR works through the ILS base", () => {
  expect(convertAmount(27, "USD", "EUR", rates)).toBe(25);
  expect(convertAmount(25, "EUR", "USD", rates)).toBe(27);
});

test("conversion with missing rate fails with status 503", () => {
  const brokenRates = { ILS: 1, USD: 0, EUR: Number.NaN } as FxRates;
  let err: Error & { status?: number } | undefined;
  try {
    convertToIls(10, "USD", brokenRates);
  } catch (e) {
    err = e as Error & { status?: number };
  }
  expect(err!.status).toBe(503);
});

test("rateToIls reports the inverse rate used for small print", () => {
  expect(rateToIls("ILS", rates)).toBe(1);
  expect(rateToIls("USD", rates)).toBe(3.703704);
  expect(rateToIls("EUR", rates)).toBe(4);
});
//#endregion

//#region Provider normalization
test("normalizes provider rates from an ILS base", () => {
  const normalized = normalizeProviderRates("ILS", {
    USD: 0.27,
    EUR: 0.25,
    GBP: 0.21
  });
  expect(normalized).toStrictEqual({ ILS: 1, USD: 0.27, EUR: 0.25 });
});

test("normalizes provider rates from a non-ILS base into ILS values", () => {
  const normalized = normalizeProviderRates("USD", {
    ILS: 3.7,
    EUR: 0.925,
    USD: 1
  });
  expect(normalized.ILS).toBe(1);
  expect(Math.abs(normalized.USD - 1 / 3.7)).toBeLessThan(1e-12);
  expect(Math.abs(normalized.EUR - 0.925 / 3.7)).toBeLessThan(1e-12);
});

test("provider normalization fails when ILS rate is missing", () => {
  expect(() => normalizeProviderRates("USD", { EUR: 0.9 })).toThrow(
    /missing a usable ILS rate/
  );
});
//#endregion

//#region Daily cache behaviour
test("fetches from the vendor once and caches the snapshot for the day", async () => {
  const deps = createDeps();

  const first = await getCurrentRatesWithDeps(deps);
  const second = await getCurrentRatesWithDeps(deps);

  expect(deps.fetchCalls()).toBe(1);
  expect(first.rates).toStrictEqual(rates);
  expect(second.rates).toStrictEqual(rates);
  expect(first.validForDate).toBe("2026-06-11");
  expect(first.isStale).toBe(false);
  expect(second.fetchedAt.toISOString()).toBe(first.fetchedAt.toISOString());
});

test("a new day triggers a fresh vendor fetch", async () => {
  let currentTime = new Date("2026-06-11T08:00:00.000Z");
  const deps = createDeps({ now: () => currentTime });

  await getCurrentRatesWithDeps(deps);
  currentTime = new Date("2026-06-12T08:00:00.000Z");
  const next = await getCurrentRatesWithDeps(deps);

  expect(deps.fetchCalls()).toBe(2);
  expect(next.validForDate).toBe("2026-06-12");
  expect(next.isStale).toBe(false);
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

  expect(snapshot.rates).toStrictEqual(rates);
  expect(snapshot.validForDate).toBe("2026-06-10");
  expect(snapshot.isStale).toBe(true);
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

  const err = await getCurrentRatesWithDeps(deps).then(() => null, (e) => e);
  expect((err as FxUnavailableError).status).toBe(503);
});

test("vendor failure with no cache at all degrades to FxUnavailableError", async () => {
  const deps = createDeps({
    fetchRates: async () => {
      throw new Error("vendor down");
    }
  });

  await expect(getCurrentRatesWithDeps(deps)).rejects.toThrow(FxUnavailableError);
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

  expect(deps.fetchCalls()).toBe(1);
  expect(snapshot.rates).toStrictEqual(rates);
});

test("utcDateKey derives the YYYY-MM-DD UTC day", () => {
  expect(utcDateKey(new Date("2026-06-11T23:59:59.000Z"))).toBe("2026-06-11");
  expect(utcDateKey(new Date("2026-06-12T00:00:00.000Z"))).toBe("2026-06-12");
});
//#endregion
