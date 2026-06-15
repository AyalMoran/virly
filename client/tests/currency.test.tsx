import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CurrencyProvider } from "../src/features/currency/CurrencyProvider";
import { CurrencySelector } from "../src/features/currency/CurrencySelector";
import { TransferQuoteSmallPrint } from "../src/features/transfer/TransferQuoteSmallPrint";
import { TransactionList } from "../src/components/TransactionList";
import {
  CURRENCY_STORAGE_KEY,
  convertIlsForDisplay,
  formatIlsAmount,
  formatMoneyIn,
  readStoredCurrency,
  storeCurrency
} from "../src/lib/currency";
import { formatCurrency } from "../src/lib/format";
import type { ExchangeRatesResponse, TransferQuote } from "../src/lib/types";

const rates: ExchangeRatesResponse = {
  baseCurrency: "ILS",
  supportedCurrencies: ["ILS", "USD", "EUR"],
  rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
  provider: "exchangerate-api",
  fetchedAt: "2026-06-11T06:00:00.000Z",
  validForDate: "2026-06-11",
  expiresAt: "2026-06-13T06:00:00.000Z",
  isStale: false
};

function withMockLocalStorage<T>(initial: Record<string, string>, fn: () => T): T {
  const store = new Map(Object.entries(initial));
  const mock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    }
  };

  const globalWithStorage = globalThis as { localStorage?: unknown };
  const original = globalWithStorage.localStorage;
  globalWithStorage.localStorage = mock;
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete globalWithStorage.localStorage;
    } else {
      globalWithStorage.localStorage = original;
    }
  }
}

//#region Conversion and formatting
test("convertIlsForDisplay converts ILS into USD/EUR with minor-unit rounding", () => {
  assert.equal(convertIlsForDisplay(100, "ILS", rates.rates), 100);
  assert.equal(convertIlsForDisplay(100, "USD", rates.rates), 27);
  assert.equal(convertIlsForDisplay(370, "EUR", rates.rates), 92.5);
  // 0.1 + 0.2 noise snaps to minor units before converting.
  assert.equal(convertIlsForDisplay(0.1 + 0.2, "USD", rates.rates), 0.08);
});

test("formatIlsAmount renders the selected display currency", () => {
  assert.equal(formatIlsAmount(100, "USD", rates), formatMoneyIn(27, "USD"));
  assert.equal(formatIlsAmount(370, "EUR", rates), formatMoneyIn(92.5, "EUR"));
});

test("formatIlsAmount keeps ILS formatting for ILS and when rates are missing", () => {
  const ilsFormatted = formatIlsAmount(123.45, "ILS", rates);
  assert.ok(ilsFormatted.includes("₪"));
  // Conversion unavailable: degrade safely to the original ILS amount.
  const fallback = formatIlsAmount(123.45, "USD", null);
  assert.equal(fallback, ilsFormatted);
});
//#endregion

//#region Persistence
test("selected display currency persists to localStorage and reads back", () => {
  withMockLocalStorage({}, () => {
    assert.equal(readStoredCurrency(), "ILS");
    storeCurrency("EUR");
    assert.equal(readStoredCurrency(), "EUR");
  });
});

test("invalid stored currency falls back to ILS", () => {
  withMockLocalStorage({ [CURRENCY_STORAGE_KEY]: "BTC" }, () => {
    assert.equal(readStoredCurrency(), "ILS");
  });
});

test("provider initializes from the persisted currency selection", () => {
  withMockLocalStorage({ [CURRENCY_STORAGE_KEY]: "USD" }, () => {
    const html = renderToStaticMarkup(
      <CurrencyProvider>
        <CurrencySelector />
      </CurrencyProvider>
    );
    assert.match(html, /<option value="USD" selected="">/);
  });
});
//#endregion

//#region Header selector
test("header renders the currency dropdown in the top-right actions area", async () => {
  const { ShellTopbar } = await import("../src/components/ShellTopbar");

  const html = withMockLocalStorage({}, () =>
    renderToStaticMarkup(
      <MemoryRouter>
        <CurrencyProvider>
          <ShellTopbar
            displayName="Dana"
            email="dana@example.com"
            balance={1234.56}
            enteredFromAuth={false}
          />
        </CurrencyProvider>
      </MemoryRouter>
    )
  );

  // The selector lives inside the header's right-aligned actions container,
  // before the user chip.
  const actionsIndex = html.indexOf('class="topbar-actions"');
  const selectorIndex = html.indexOf('aria-label="Display currency"');
  const userChipIndex = html.indexOf('class="topbar-user"');
  assert.ok(actionsIndex >= 0, "topbar-actions should render");
  assert.ok(selectorIndex > actionsIndex, "selector should be inside topbar actions");
  assert.ok(userChipIndex > selectorIndex, "selector should sit before the user chip");
});

test("currency selector offers ILS, USD and EUR with an accessible label", () => {
  const html = renderToStaticMarkup(
    <CurrencySelector currency="ILS" onCurrencyChange={() => {}} />
  );
  assert.match(html, /aria-label="Display currency"/);
  assert.match(html, /value="ILS"/);
  assert.match(html, /value="USD"/);
  assert.match(html, /value="EUR"/);
  assert.ok(!html.includes("GBP"));
});
//#endregion

//#region Amount rendering in selected currency
test("transaction amounts render converted when a display currency is selected", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <CurrencyProvider initialCurrency="USD" initialRates={rates}>
        <TransactionList
          transactions={[
            {
              id: "tx-1",
              amount: 100,
              counterpartyEmail: "friend@example.com",
              date: "2026-06-10T10:00:00.000Z"
            }
          ]}
        />
      </CurrencyProvider>
    </MemoryRouter>
  );

  // ₪100 at 0.27 USD per ILS renders as $27.00.
  assert.ok(html.includes(formatMoneyIn(27, "USD")));
  assert.ok(!html.includes("₪"));
});

test("transaction amounts stay in ILS without rates (conversion unavailable)", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <CurrencyProvider initialCurrency="USD" initialRates={null}>
        <TransactionList
          transactions={[
            {
              id: "tx-1",
              amount: 100,
              counterpartyEmail: "friend@example.com",
              date: "2026-06-10T10:00:00.000Z"
            }
          ]}
        />
      </CurrencyProvider>
    </MemoryRouter>
  );

  assert.ok(html.includes("₪"));
});
//#endregion

//#region Transfer confirmation small print
const usdQuote: TransferQuote = {
  enteredAmount: 50,
  enteredCurrency: "USD",
  amountIls: 185.19,
  rate: 3.703704,
  rateFetchedAt: "2026-06-11T06:00:00.000Z",
  rateValidForDate: "2026-06-11",
  baseCurrency: "ILS",
  provider: "exchangerate-api"
};

test("USD transfer confirmation small print shows the actual ILS amount", () => {
  const html = renderToStaticMarkup(<TransferQuoteSmallPrint quote={usdQuote} />);
  assert.match(html, /class="transfer-quote-small-print"/);
  assert.ok(html.includes("Actual transfer amount:"));
  assert.ok(html.includes(formatCurrency(185.19)));
  assert.ok(html.includes("USD → ILS rate"));
  assert.ok(html.includes("2026-06-11"));
});

test("ILS transfer confirmation renders no conversion small print", () => {
  const html = renderToStaticMarkup(
    <TransferQuoteSmallPrint
      quote={{
        enteredAmount: 120,
        enteredCurrency: "ILS",
        amountIls: 120,
        rate: 1,
        rateFetchedAt: null,
        rateValidForDate: null,
        baseCurrency: "ILS",
        provider: null
      }}
    />
  );
  assert.equal(html, "");
});
//#endregion
