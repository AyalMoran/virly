import { createHash } from "node:crypto";
import { config } from "../config.js";
import { ExchangeRate } from "../models/ExchangeRate.js";
import { AppError } from "../utils/app-error.js";

export const FX_BASE_CURRENCY = "ILS" as const;
export const SUPPORTED_CURRENCIES = ["ILS", "USD", "EUR"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Units of each currency per 1 ILS. `ILS` is always 1. */
export type FxRates = Record<SupportedCurrency, number>;

export type FxSnapshot = {
  baseCurrency: typeof FX_BASE_CURRENCY;
  rates: FxRates;
  provider: string;
  fetchedAt: Date;
  validForDate: string;
  expiresAt: Date;
  /** True when the snapshot was fetched for an earlier day (vendor fallback). */
  isStale: boolean;
};

export type StoredFxSnapshot = Omit<FxSnapshot, "isStale"> & {
  sourceResponseHash: string | null;
};

export type FxStore = {
  findByDate(
    baseCurrency: string,
    validForDate: string
  ): Promise<StoredFxSnapshot | null>;
  findLatest(baseCurrency: string): Promise<StoredFxSnapshot | null>;
  upsert(snapshot: StoredFxSnapshot): Promise<void>;
};

export type ProviderFetchResult = {
  rates: FxRates;
  provider: string;
  sourceResponseHash: string | null;
};

export type FxDeps = {
  store: FxStore;
  fetchRates: () => Promise<ProviderFetchResult>;
  now: () => Date;
  cacheTtlHours: number;
};

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}

export function assertSupportedCurrency(value: unknown): SupportedCurrency {
  if (!isSupportedCurrency(value)) {
    throw new AppError(
      400,
      `Unsupported currency "${String(value)}". Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}.`
    );
  }

  return value;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Converts between supported currencies using ILS-based rates. Amounts are
 * snapped to integer minor units (agorot/cents) before applying the rate so
 * floating-point noise from user input cannot leak into the result.
 */
export function convertAmount(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  rates: FxRates
): number {
  assertSupportedCurrency(from);
  assertSupportedCurrency(to);

  if (!Number.isFinite(amount)) {
    throw new AppError(400, "Amount must be a finite number.");
  }

  const minorUnits = Math.round(amount * 100);
  if (from === to) {
    return minorUnits / 100;
  }

  const fromRate = rates[from];
  const toRate = rates[to];
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    throw new AppError(503, "Exchange rates are unavailable.");
  }

  return Math.round((minorUnits * toRate) / fromRate) / 100;
}

export function convertToIls(
  amount: number,
  currency: SupportedCurrency,
  rates: FxRates
) {
  return convertAmount(amount, currency, "ILS", rates);
}

export function convertFromIls(
  amountIls: number,
  currency: SupportedCurrency,
  rates: FxRates
) {
  return convertAmount(amountIls, "ILS", currency, rates);
}

/** Rate for converting 1 unit of `currency` into ILS (e.g. USD→ILS ≈ 3.7). */
export function rateToIls(currency: SupportedCurrency, rates: FxRates) {
  if (currency === "ILS") {
    return 1;
  }

  const rate = rates[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new AppError(503, "Exchange rates are unavailable.");
  }

  return Math.round((1 / rate) * 1e6) / 1e6;
}

export function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

type ProviderResponseBody = {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  conversion_rates?: Record<string, number>;
  "error-type"?: string;
};

function buildProviderUrl() {
  if (config.fx.baseUrl) {
    return `${config.fx.baseUrl.replace(/\/+$/, "")}/${FX_BASE_CURRENCY}`;
  }

  if (config.fx.apiKey) {
    return `https://v6.exchangerate-api.com/v6/${config.fx.apiKey}/latest/${FX_BASE_CURRENCY}`;
  }

  return `https://open.er-api.com/v6/latest/${FX_BASE_CURRENCY}`;
}

/**
 * Normalizes a provider rate table (any base) into ILS-based rates restricted
 * to the supported currencies.
 */
export function normalizeProviderRates(
  baseCode: string,
  providerRates: Record<string, number>
): FxRates {
  const ilsPerBase =
    baseCode === FX_BASE_CURRENCY ? 1 : providerRates[FX_BASE_CURRENCY];

  if (!Number.isFinite(ilsPerBase) || (ilsPerBase as number) <= 0) {
    throw new Error(
      `FX provider response is missing a usable ${FX_BASE_CURRENCY} rate.`
    );
  }

  const normalized = {} as FxRates;
  for (const currency of SUPPORTED_CURRENCIES) {
    const perBase = currency === baseCode ? 1 : providerRates[currency];
    if (!Number.isFinite(perBase) || perBase <= 0) {
      throw new Error(`FX provider response is missing the ${currency} rate.`);
    }

    normalized[currency] = perBase / (ilsPerBase as number);
  }

  normalized.ILS = 1;
  return normalized;
}

export async function fetchRatesFromProvider(
  fetchImpl: typeof fetch = fetch
): Promise<ProviderFetchResult> {
  const response = await fetchImpl(buildProviderUrl());

  if (!response.ok) {
    throw new Error(`FX provider request failed with HTTP ${response.status}.`);
  }

  const text = await response.text();
  const body = JSON.parse(text) as ProviderResponseBody;

  if (body.result !== "success") {
    throw new Error(
      `FX provider returned an error: ${body["error-type"] ?? "unknown"}.`
    );
  }

  const providerRates = body.conversion_rates ?? body.rates;
  if (!providerRates) {
    throw new Error("FX provider response did not include rates.");
  }

  return {
    rates: normalizeProviderRates(body.base_code ?? FX_BASE_CURRENCY, providerRates),
    provider: config.fx.provider,
    sourceResponseHash: createHash("sha256").update(text).digest("hex")
  };
}

const mongoFxStore: FxStore = {
  async findByDate(baseCurrency, validForDate) {
    const doc = await ExchangeRate.findOne({ baseCurrency, validForDate })
      .sort({ fetchedAt: -1 })
      .lean();
    return doc ? toStoredSnapshot(doc) : null;
  },
  async findLatest(baseCurrency) {
    const doc = await ExchangeRate.findOne({ baseCurrency })
      .sort({ fetchedAt: -1 })
      .lean();
    return doc ? toStoredSnapshot(doc) : null;
  },
  async upsert(snapshot) {
    await ExchangeRate.updateOne(
      { baseCurrency: snapshot.baseCurrency, validForDate: snapshot.validForDate },
      { $set: snapshot },
      { upsert: true }
    );
  }
};

function toStoredSnapshot(doc: {
  baseCurrency?: unknown;
  rates?: unknown;
  provider?: unknown;
  fetchedAt?: unknown;
  validForDate?: unknown;
  expiresAt?: unknown;
  sourceResponseHash?: unknown;
}): StoredFxSnapshot {
  return {
    baseCurrency: FX_BASE_CURRENCY,
    rates: doc.rates as FxRates,
    provider: String(doc.provider ?? "unknown"),
    fetchedAt: new Date(doc.fetchedAt as string | Date),
    validForDate: String(doc.validForDate ?? ""),
    expiresAt: new Date(doc.expiresAt as string | Date),
    sourceResponseHash:
      doc.sourceResponseHash === undefined ? null : (doc.sourceResponseHash as string | null)
  };
}

function defaultDeps(): FxDeps {
  return {
    store: mongoFxStore,
    fetchRates: () => fetchRatesFromProvider(),
    now: () => new Date(),
    cacheTtlHours: config.fx.cacheTtlHours
  };
}

function toSnapshot(stored: StoredFxSnapshot, today: string): FxSnapshot {
  return {
    baseCurrency: FX_BASE_CURRENCY,
    rates: stored.rates,
    provider: stored.provider,
    fetchedAt: stored.fetchedAt,
    validForDate: stored.validForDate,
    expiresAt: stored.expiresAt,
    isStale: stored.validForDate !== today
  };
}

export class FxUnavailableError extends AppError {
  constructor(message = "Currency conversion is currently unavailable.") {
    super(503, message);
    this.name = "FxUnavailableError";
  }
}

/**
 * Returns the daily ILS-based rate snapshot. The vendor is called at most
 * once per UTC day: today's cached snapshot wins, a fresh fetch is stored on
 * cache miss, and on vendor failure the latest non-expired snapshot is used.
 */
export async function getCurrentRatesWithDeps(deps: FxDeps): Promise<FxSnapshot> {
  const now = deps.now();
  const today = utcDateKey(now);

  const cachedToday = await deps.store.findByDate(FX_BASE_CURRENCY, today);
  if (cachedToday && cachedToday.expiresAt.getTime() > now.getTime()) {
    return toSnapshot(cachedToday, today);
  }

  try {
    const fetched = await deps.fetchRates();
    const stored: StoredFxSnapshot = {
      baseCurrency: FX_BASE_CURRENCY,
      rates: fetched.rates,
      provider: fetched.provider,
      fetchedAt: now,
      validForDate: today,
      expiresAt: new Date(now.getTime() + deps.cacheTtlHours * 60 * 60 * 1000),
      sourceResponseHash: fetched.sourceResponseHash
    };
    await deps.store.upsert(stored);
    return toSnapshot(stored, today);
  } catch (error) {
    const latest = await deps.store.findLatest(FX_BASE_CURRENCY);
    if (latest && latest.expiresAt.getTime() > now.getTime()) {
      console.error("FX provider fetch failed; using cached rates:", error);
      return toSnapshot(latest, today);
    }

    console.error("FX provider fetch failed and no cached rates exist:", error);
    throw new FxUnavailableError();
  }
}

export function getCurrentRates() {
  return getCurrentRatesWithDeps(defaultDeps());
}

export type TransferFxQuote = {
  enteredAmount: number;
  enteredCurrency: SupportedCurrency;
  /** The authoritative ILS amount that will move on the ledger. */
  amountIls: number;
  /** Conversion rate from `enteredCurrency` into ILS. */
  rate: number;
  rateFetchedAt: string;
  rateValidForDate: string;
  baseCurrency: typeof FX_BASE_CURRENCY;
  provider: string;
};

/**
 * Server-side quote for a transfer entered in any supported currency. The
 * same snapshot must be echoed back on confirmation so the executed rate is
 * guaranteed to match the quoted one.
 */
export function buildTransferQuote(
  amount: number,
  currency: SupportedCurrency,
  snapshot: FxSnapshot
): TransferFxQuote {
  assertSupportedCurrency(currency);

  return {
    enteredAmount: roundMoney(amount),
    enteredCurrency: currency,
    amountIls: convertToIls(amount, currency, snapshot.rates),
    rate: rateToIls(currency, snapshot.rates),
    rateFetchedAt: snapshot.fetchedAt.toISOString(),
    rateValidForDate: snapshot.validForDate,
    baseCurrency: FX_BASE_CURRENCY,
    provider: snapshot.provider
  };
}

const FX_REFRESH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Warms the daily snapshot on boot and re-checks periodically. The cache
 * layer guarantees the vendor is still called at most once per UTC day; the
 * interval only ensures the day rollover is picked up without user traffic.
 */
export function startDailyFxRefresh() {
  const refresh = async () => {
    try {
      await getCurrentRates();
    } catch (error) {
      console.error("Daily FX refresh failed:", error);
    }
  };

  void refresh();
  const timer = setInterval(refresh, FX_REFRESH_CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
