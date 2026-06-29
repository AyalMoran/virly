// server/tests/contract/exchangeRate.contract.test.ts
import { describeContract } from "./harness.js";
import type { ExchangeRateRecord } from "../../src/repositories/types.js";

// Helper: build a minimal upsert payload with sensible defaults, overridable.
function makeRate(
  overrides: Partial<Omit<ExchangeRateRecord, "id" | "createdAt" | "updatedAt">> = {}
): Omit<ExchangeRateRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    baseCurrency: "ILS",
    rates: { USD: 3.7, EUR: 4.01 },
    provider: "test-provider",
    fetchedAt: new Date("2024-01-15T10:00:00.000Z"),
    validForDate: "2024-01-15",
    expiresAt: new Date("2024-01-16T00:00:00.000Z"),
    sourceResponseHash: null,
    ...overrides
  };
}

describeContract("ExchangeRateRepository", {
  // ---- upsertForDate: insert then update (no duplicate) ----

  "upsertForDate inserts a new row and returns it with a 24-hex id": async ({ repos }) => {
    const input = makeRate();
    const result = await repos.exchangeRates.upsertForDate(input);
    expect(result.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(result.baseCurrency).toBe("ILS");
    expect(result.validForDate).toBe("2024-01-15");
    expect(result.provider).toBe("test-provider");
    expect(result.rates).toStrictEqual({ USD: 3.7, EUR: 4.01 });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  },

  "upsertForDate with same base+date updates existing row (no duplicate)": async ({ repos }) => {
    const first = await repos.exchangeRates.upsertForDate(
      makeRate({ provider: "provider-v1", rates: { USD: 3.7 } })
    );

    const second = await repos.exchangeRates.upsertForDate(
      makeRate({
        provider: "provider-v2",
        rates: { USD: 3.75, EUR: 4.05 },
        fetchedAt: new Date("2024-01-15T12:00:00.000Z")
      })
    );

    // Same id — no new row created
    expect(second.id).toBe(first.id);
    // Updated fields
    expect(second.provider).toBe("provider-v2");
    expect(second.rates).toStrictEqual({ USD: 3.75, EUR: 4.05 });
    expect(second.fetchedAt.toISOString()).toBe("2024-01-15T12:00:00.000Z");
    // updatedAt advanced
    expect(second.updatedAt >= first.updatedAt).toBeTruthy();

    // Cross-check via findForDate — still only one row
    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    expect(found).toBeTruthy();
    expect(found!.id).toBe(first.id);
    expect(found!.provider).toBe("provider-v2");
  },

  // ---- latestForBase: most-recent by fetchedAt ----

  "latestForBase returns null when no rows exist for base": async ({ repos }) => {
    const result = await repos.exchangeRates.latestForBase("USD");
    expect(result).toBeNull();
  },

  "latestForBase returns most-recent by fetchedAt among multiple dates": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(
      makeRate({ validForDate: "2024-01-13", fetchedAt: new Date("2024-01-13T08:00:00.000Z"), rates: { USD: 3.6 } })
    );
    await repos.exchangeRates.upsertForDate(
      makeRate({ validForDate: "2024-01-15", fetchedAt: new Date("2024-01-15T10:00:00.000Z"), rates: { USD: 3.7 } })
    );
    await repos.exchangeRates.upsertForDate(
      makeRate({ validForDate: "2024-01-14", fetchedAt: new Date("2024-01-14T09:00:00.000Z"), rates: { USD: 3.65 } })
    );

    const result = await repos.exchangeRates.latestForBase("ILS");
    expect(result).toBeTruthy();
    expect(result!.validForDate).toBe("2024-01-15");
    expect(result!.rates).toStrictEqual({ USD: 3.7 });
  },

  "latestForBase does not return rows for a different base": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(makeRate({ baseCurrency: "USD" }));
    const result = await repos.exchangeRates.latestForBase("EUR");
    expect(result).toBeNull();
  },

  // ---- findForDate ----

  "findForDate returns null when no row for that base+date": async ({ repos }) => {
    const result = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    expect(result).toBeNull();
  },

  "findForDate returns the row for a matching base+date": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(makeRate({ validForDate: "2024-01-15", rates: { USD: 3.7, EUR: 4.01 } }));
    await repos.exchangeRates.upsertForDate(makeRate({ validForDate: "2024-01-16", rates: { USD: 3.8 } }));

    const result = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    expect(result).toBeTruthy();
    expect(result!.validForDate).toBe("2024-01-15");
    expect(result!.rates).toStrictEqual({ USD: 3.7, EUR: 4.01 });
  },

  "findForDate returns null for the wrong date on the same base": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(makeRate({ validForDate: "2024-01-15" }));
    const result = await repos.exchangeRates.findForDate("ILS", "2024-01-99");
    expect(result).toBeNull();
  },

  // ---- rates jsonb round-trip ----

  "rates (jsonb object of numbers) round-trips exactly": async ({ repos }) => {
    const rates = { USD: 3.7, EUR: 4.01, GBP: 4.72, JPY: 0.025 };
    const inserted = await repos.exchangeRates.upsertForDate(makeRate({ rates }));
    expect(inserted.rates).toStrictEqual(rates);

    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    expect(found).toBeTruthy();
    expect(found!.rates).toStrictEqual(rates);
  },

  // ---- sourceResponseHash nullable round-trip ----

  "sourceResponseHash null round-trips as null": async ({ repos }) => {
    const result = await repos.exchangeRates.upsertForDate(makeRate({ sourceResponseHash: null }));
    expect(result.sourceResponseHash).toBeNull();

    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    expect(found).toBeTruthy();
    expect(found!.sourceResponseHash).toBeNull();
  },

  "sourceResponseHash non-null round-trips correctly": async ({ repos }) => {
    const hash = "sha256:abc123def456";
    const result = await repos.exchangeRates.upsertForDate(makeRate({ sourceResponseHash: hash }));
    expect(result.sourceResponseHash).toBe(hash);

    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    expect(found).toBeTruthy();
    expect(found!.sourceResponseHash).toBe(hash);
  },

  // ---- date fields are Date objects ----

  "fetchedAt, expiresAt, createdAt, updatedAt are Date instances": async ({ repos }) => {
    const result = await repos.exchangeRates.upsertForDate(makeRate());
    expect(result.fetchedAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  }
});
