// server/tests/contract/exchangeRate.contract.test.ts
import assert from "node:assert/strict";
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
    assert.match(result.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(result.baseCurrency, "ILS");
    assert.equal(result.validForDate, "2024-01-15");
    assert.equal(result.provider, "test-provider");
    assert.deepEqual(result.rates, { USD: 3.7, EUR: 4.01 });
    assert.ok(result.createdAt instanceof Date);
    assert.ok(result.updatedAt instanceof Date);
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
    assert.equal(second.id, first.id);
    // Updated fields
    assert.equal(second.provider, "provider-v2");
    assert.deepEqual(second.rates, { USD: 3.75, EUR: 4.05 });
    assert.equal(second.fetchedAt.toISOString(), "2024-01-15T12:00:00.000Z");
    // updatedAt advanced
    assert.ok(second.updatedAt >= first.updatedAt);

    // Cross-check via findForDate — still only one row
    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    assert.ok(found);
    assert.equal(found.id, first.id);
    assert.equal(found.provider, "provider-v2");
  },

  // ---- latestForBase: most-recent by fetchedAt ----

  "latestForBase returns null when no rows exist for base": async ({ repos }) => {
    const result = await repos.exchangeRates.latestForBase("USD");
    assert.equal(result, null);
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
    assert.ok(result);
    assert.equal(result.validForDate, "2024-01-15");
    assert.deepEqual(result.rates, { USD: 3.7 });
  },

  "latestForBase does not return rows for a different base": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(makeRate({ baseCurrency: "USD" }));
    const result = await repos.exchangeRates.latestForBase("EUR");
    assert.equal(result, null);
  },

  // ---- findForDate ----

  "findForDate returns null when no row for that base+date": async ({ repos }) => {
    const result = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    assert.equal(result, null);
  },

  "findForDate returns the row for a matching base+date": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(makeRate({ validForDate: "2024-01-15", rates: { USD: 3.7, EUR: 4.01 } }));
    await repos.exchangeRates.upsertForDate(makeRate({ validForDate: "2024-01-16", rates: { USD: 3.8 } }));

    const result = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    assert.ok(result);
    assert.equal(result.validForDate, "2024-01-15");
    assert.deepEqual(result.rates, { USD: 3.7, EUR: 4.01 });
  },

  "findForDate returns null for the wrong date on the same base": async ({ repos }) => {
    await repos.exchangeRates.upsertForDate(makeRate({ validForDate: "2024-01-15" }));
    const result = await repos.exchangeRates.findForDate("ILS", "2024-01-99");
    assert.equal(result, null);
  },

  // ---- rates jsonb round-trip ----

  "rates (jsonb object of numbers) round-trips exactly": async ({ repos }) => {
    const rates = { USD: 3.7, EUR: 4.01, GBP: 4.72, JPY: 0.025 };
    const inserted = await repos.exchangeRates.upsertForDate(makeRate({ rates }));
    assert.deepEqual(inserted.rates, rates);

    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    assert.ok(found);
    assert.deepEqual(found.rates, rates);
  },

  // ---- sourceResponseHash nullable round-trip ----

  "sourceResponseHash null round-trips as null": async ({ repos }) => {
    const result = await repos.exchangeRates.upsertForDate(makeRate({ sourceResponseHash: null }));
    assert.equal(result.sourceResponseHash, null);

    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    assert.ok(found);
    assert.equal(found.sourceResponseHash, null);
  },

  "sourceResponseHash non-null round-trips correctly": async ({ repos }) => {
    const hash = "sha256:abc123def456";
    const result = await repos.exchangeRates.upsertForDate(makeRate({ sourceResponseHash: hash }));
    assert.equal(result.sourceResponseHash, hash);

    const found = await repos.exchangeRates.findForDate("ILS", "2024-01-15");
    assert.ok(found);
    assert.equal(found.sourceResponseHash, hash);
  },

  // ---- date fields are Date objects ----

  "fetchedAt, expiresAt, createdAt, updatedAt are Date instances": async ({ repos }) => {
    const result = await repos.exchangeRates.upsertForDate(makeRate());
    assert.ok(result.fetchedAt instanceof Date);
    assert.ok(result.expiresAt instanceof Date);
    assert.ok(result.createdAt instanceof Date);
    assert.ok(result.updatedAt instanceof Date);
  }
});
