import type { DisplayCurrency, ExchangeRatesResponse } from "../types";
import {
  CURRENCY_LABELS,
  CURRENCY_STORAGE_KEY,
  SUPPORTED_DISPLAY_CURRENCIES,
  convertIlsForDisplay,
  formatIlsAmount,
  formatMoneyIn,
  isDisplayCurrency,
  readStoredCurrency,
  storeCurrency,
} from "../currency.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRates(
  ils = 1,
  usd = 0.27,
  eur = 0.25
): Record<DisplayCurrency, number> {
  return { ILS: ils, USD: usd, EUR: eur };
}

function makeRatesResponse(
  rates: Record<DisplayCurrency, number> = makeRates()
): ExchangeRatesResponse {
  return {
    baseCurrency: "ILS",
    supportedCurrencies: ["ILS", "USD", "EUR"],
    rates,
    provider: "test",
    fetchedAt: "2026-06-28T00:00:00.000Z",
    validForDate: "2026-06-28",
    expiresAt: "2026-06-29T00:00:00.000Z",
    isStale: false,
  };
}

// ---------------------------------------------------------------------------
// Static exports
// ---------------------------------------------------------------------------

describe("SUPPORTED_DISPLAY_CURRENCIES", () => {
  test("contains exactly ILS, USD, EUR", () => {
    expect(SUPPORTED_DISPLAY_CURRENCIES).toStrictEqual(["ILS", "USD", "EUR"]);
  });
});

describe("CURRENCY_LABELS", () => {
  test("maps each supported currency to a non-empty label string", () => {
    for (const c of SUPPORTED_DISPLAY_CURRENCIES) {
      expect(typeof CURRENCY_LABELS[c]).toBe("string");
      expect(CURRENCY_LABELS[c].length).toBeGreaterThan(0);
    }
  });

  test("ILS label contains the shekel sign", () => {
    expect(CURRENCY_LABELS["ILS"]).toContain("₪");
  });
});

// ---------------------------------------------------------------------------
// isDisplayCurrency
// ---------------------------------------------------------------------------

describe("isDisplayCurrency", () => {
  test("returns true for each supported currency string", () => {
    expect(isDisplayCurrency("ILS")).toBe(true);
    expect(isDisplayCurrency("USD")).toBe(true);
    expect(isDisplayCurrency("EUR")).toBe(true);
  });

  test("returns false for an unknown currency code", () => {
    expect(isDisplayCurrency("GBP")).toBe(false);
    expect(isDisplayCurrency("JPY")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isDisplayCurrency("")).toBe(false);
  });

  test("returns false for non-string values", () => {
    expect(isDisplayCurrency(null)).toBe(false);
    expect(isDisplayCurrency(undefined)).toBe(false);
    expect(isDisplayCurrency(42)).toBe(false);
    expect(isDisplayCurrency({})).toBe(false);
  });

  test("is case-sensitive (lowercase is rejected)", () => {
    expect(isDisplayCurrency("ils")).toBe(false);
    expect(isDisplayCurrency("usd")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readStoredCurrency / storeCurrency  (localStorage)
//
// The test environment is "node" (no jsdom), so we provide a minimal in-memory
// localStorage stub on globalThis before each test and tear it down after.
// ---------------------------------------------------------------------------

function makeLocalStorageStub(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

describe("readStoredCurrency", () => {
  let stubStorage: Storage;

  beforeEach(() => {
    stubStorage = makeLocalStorageStub();
    (globalThis as Record<string, unknown>).localStorage = stubStorage;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  test("returns ILS when nothing is stored", () => {
    expect(readStoredCurrency()).toBe("ILS");
  });

  test("returns USD when USD is stored", () => {
    stubStorage.setItem(CURRENCY_STORAGE_KEY, "USD");
    expect(readStoredCurrency()).toBe("USD");
  });

  test("returns EUR when EUR is stored", () => {
    stubStorage.setItem(CURRENCY_STORAGE_KEY, "EUR");
    expect(readStoredCurrency()).toBe("EUR");
  });

  test("returns ILS when the stored value is not a supported currency", () => {
    stubStorage.setItem(CURRENCY_STORAGE_KEY, "GBP");
    expect(readStoredCurrency()).toBe("ILS");
  });

  test("returns ILS when localStorage throws (e.g. in a sandboxed context)", () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(readStoredCurrency()).toBe("ILS");
  });
});

describe("storeCurrency", () => {
  let stubStorage: Storage;

  beforeEach(() => {
    stubStorage = makeLocalStorageStub();
    (globalThis as Record<string, unknown>).localStorage = stubStorage;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  test("persists a supported currency so readStoredCurrency returns it", () => {
    storeCurrency("USD");
    expect(readStoredCurrency()).toBe("USD");
  });

  test("overwrites a previously stored value", () => {
    storeCurrency("USD");
    storeCurrency("EUR");
    expect(readStoredCurrency()).toBe("EUR");
  });

  test("writes ILS and readStoredCurrency returns it", () => {
    storeCurrency("ILS");
    expect(readStoredCurrency()).toBe("ILS");
  });

  test("does not throw when localStorage.setItem throws", () => {
    (globalThis as Record<string, unknown>).localStorage = {
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(() => storeCurrency("ILS")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// convertIlsForDisplay
// ---------------------------------------------------------------------------

describe("convertIlsForDisplay", () => {
  const rates = makeRates(1, 0.27, 0.25);

  test("returns the same amount when currency is ILS", () => {
    expect(convertIlsForDisplay(100, "ILS", rates)).toBe(100);
    expect(convertIlsForDisplay(0, "ILS", rates)).toBe(0);
  });

  test("converts a round ILS amount to USD using the provided rate", () => {
    // 100 ILS * 0.27 = 27.00 USD
    expect(convertIlsForDisplay(100, "USD", rates)).toBe(27);
  });

  test("converts a round ILS amount to EUR using the provided rate", () => {
    // 200 ILS * 0.25 = 50.00 EUR
    expect(convertIlsForDisplay(200, "EUR", rates)).toBe(50);
  });

  test("rounds to the nearest cent to avoid floating-point noise", () => {
    // 10.01 ILS * 0.27 = 2.7027 => 2.70
    expect(convertIlsForDisplay(10.01, "USD", rates)).toBe(2.7);
  });

  test("falls back to the ILS amount when rate is zero", () => {
    const zeroRates = makeRates(1, 0, 0.25);
    expect(convertIlsForDisplay(50, "USD", zeroRates)).toBe(50);
  });

  test("falls back to the ILS amount when rate is negative", () => {
    const negRates = makeRates(1, -0.27, 0.25);
    expect(convertIlsForDisplay(50, "USD", negRates)).toBe(50);
  });

  test("falls back to the ILS amount when rate is NaN", () => {
    const nanRates = makeRates(1, NaN, 0.25);
    expect(convertIlsForDisplay(50, "USD", nanRates)).toBe(50);
  });

  test("handles zero ILS amount", () => {
    expect(convertIlsForDisplay(0, "USD", rates)).toBe(0);
    expect(convertIlsForDisplay(0, "EUR", rates)).toBe(0);
  });

  test("handles a large amount without overflow", () => {
    // 100_000 ILS * 0.27 = 27_000 USD
    expect(convertIlsForDisplay(100_000, "USD", rates)).toBe(27_000);
  });
});

// ---------------------------------------------------------------------------
// formatMoneyIn
// ---------------------------------------------------------------------------

describe("formatMoneyIn", () => {
  test("formats a USD amount with two decimal places and dollar sign", () => {
    const out = formatMoneyIn(27, "USD");
    expect(out).toMatch(/27\.00/);
    expect(out).toContain("$");
  });

  test("formats a EUR amount with two decimal places", () => {
    const out = formatMoneyIn(50.5, "EUR");
    expect(out).toMatch(/50\.50/);
  });

  test("formats zero with two decimal places", () => {
    const out = formatMoneyIn(0, "USD");
    expect(out).toMatch(/0\.00/);
  });

  test("accepts an explicit locale without throwing", () => {
    expect(() => formatMoneyIn(100, "USD", "fr-FR")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// formatIlsAmount
// ---------------------------------------------------------------------------

describe("formatIlsAmount", () => {
  const ratesResponse = makeRatesResponse();

  test("returns ILS formatting when currency is ILS regardless of rates", () => {
    const out = formatIlsAmount(100, "ILS", ratesResponse);
    // formatCurrency(100) produces ILS-formatted string
    expect(typeof out).toBe("string");
    expect(out).toMatch(/100/);
  });

  test("returns ILS formatting when rates snapshot is null", () => {
    const out = formatIlsAmount(100, "USD", null);
    expect(typeof out).toBe("string");
    expect(out).toMatch(/100/);
  });

  test("converts and formats to USD when rates snapshot is provided", () => {
    // 100 ILS * 0.27 = 27.00 USD
    const out = formatIlsAmount(100, "USD", ratesResponse);
    expect(out).toMatch(/27\.00/);
    expect(out).toContain("$");
  });

  test("converts and formats to EUR when rates snapshot is provided", () => {
    // 200 ILS * 0.25 = 50.00 EUR
    const out = formatIlsAmount(200, "EUR", ratesResponse);
    expect(out).toMatch(/50\.00/);
  });

  test("handles zero ILS amount with a rates snapshot", () => {
    const out = formatIlsAmount(0, "USD", ratesResponse);
    expect(out).toMatch(/0\.00/);
  });

  test("degrades safely to ILS when the USD rate is zero in the snapshot", () => {
    const staleRates = makeRatesResponse(makeRates(1, 0, 0.25));
    const out = formatIlsAmount(100, "USD", staleRates);
    // Falls back: convertIlsForDisplay returns the ILS amount (100)
    expect(out).toMatch(/100/);
  });
});
