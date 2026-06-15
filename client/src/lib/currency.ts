import type { DisplayCurrency, ExchangeRatesResponse } from "./types";
import { formatCurrency } from "./format";

export const SUPPORTED_DISPLAY_CURRENCIES: DisplayCurrency[] = [
  "ILS",
  "USD",
  "EUR"
];

export const CURRENCY_STORAGE_KEY = "virly-display-currency";

export const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  ILS: "₪ ILS",
  USD: "$ USD",
  EUR: "€ EUR"
};

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_DISPLAY_CURRENCIES as string[]).includes(value)
  );
}

export function readStoredCurrency(): DisplayCurrency {
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isDisplayCurrency(stored) ? stored : "ILS";
  } catch {
    return "ILS";
  }
}

export function storeCurrency(currency: DisplayCurrency) {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // Preference simply won't persist when storage is unavailable.
  }
}

/**
 * Converts an authoritative ILS amount into a display currency using the
 * daily ILS-based rates (units per 1 ILS). Snaps to integer minor units so
 * floating-point noise never reaches the displayed value.
 */
export function convertIlsForDisplay(
  amountIls: number,
  currency: DisplayCurrency,
  rates: Record<DisplayCurrency, number>
): number {
  const minorUnits = Math.round(amountIls * 100);
  if (currency === "ILS") {
    return minorUnits / 100;
  }

  const rate = rates[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    return minorUnits / 100;
  }

  return Math.round(minorUnits * rate) / 100;
}

export function formatMoneyIn(
  amount: number,
  currency: DisplayCurrency,
  locale = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Formats an ILS ledger amount in the selected display currency. Without a
 * usable rate snapshot the amount degrades safely to plain ILS formatting.
 */
export function formatIlsAmount(
  amountIls: number,
  currency: DisplayCurrency,
  rates: ExchangeRatesResponse | null
): string {
  if (currency === "ILS" || !rates) {
    return formatCurrency(amountIls);
  }

  return formatMoneyIn(
    convertIlsForDisplay(amountIls, currency, rates.rates),
    currency
  );
}
