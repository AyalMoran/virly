import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CurrencyProvider } from "../../features/currency/CurrencyProvider.js";
import { TransactionReceipt } from "../TransactionReceipt.js";
import type { Transaction } from "../../lib/types.js";

function render(tx: Transaction): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CurrencyProvider initialCurrency="ILS" initialRates={null}>
        <TransactionReceipt transaction={tx} onClose={() => {}} />
      </CurrencyProvider>
    </MemoryRouter>
  );
}

const CREDIT_TX: Transaction = {
  id: "txid-credit-001",
  amount: 350,
  counterpartyEmail: "alice@example.com",
  reason: "Birthday gift",
  date: "2026-06-15T09:00:00.000Z",
};

const DEBIT_TX: Transaction = {
  id: "txid-debit-001",
  amount: -120,
  counterpartyEmail: "bob@example.com",
  reason: "Dinner",
  date: "2026-06-14T20:00:00.000Z",
};

const NO_REASON_TX: Transaction = {
  id: "txid-noreason",
  amount: 50,
  counterpartyEmail: "carol@example.com",
  reason: null,
  date: "2026-06-10T08:00:00.000Z",
};

const FX_TX: Transaction = {
  id: "txid-fx",
  amount: 200,
  counterpartyEmail: "dana@example.com",
  reason: "FX test",
  date: "2026-06-12T10:00:00.000Z",
  fx: {
    enteredCurrency: "USD",
    enteredAmount: 54.32,
  },
};

// ---------------------------------------------------------------------------
// Credit transaction
// ---------------------------------------------------------------------------

describe("TransactionReceipt — credit transaction", () => {
  it("renders + sign for credit amount", () => {
    const html = render(CREDIT_TX);
    // The component uses proper minus vs +
    expect(html).toMatch(/\+/);
  });

  it("renders 'Money received' direction label", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Money received/);
  });

  it("renders 'From' label for credit", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/From/);
  });

  it("renders counterparty email", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/alice@example\.com/);
  });

  it("renders is-credit class on amount", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/is-credit/);
  });

  it("renders Received stamp text", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Received/);
  });
});

// ---------------------------------------------------------------------------
// Debit transaction
// ---------------------------------------------------------------------------

describe("TransactionReceipt — debit transaction", () => {
  it("renders proper minus sign for debit amount", () => {
    const html = render(DEBIT_TX);
    // The component uses the minus character U+2212
    expect(html).toMatch(/−|&#x2212;/);
  });

  it("renders 'Money sent' direction label", () => {
    const html = render(DEBIT_TX);
    expect(html).toMatch(/Money sent/);
  });

  it("renders 'To' label for debit", () => {
    const html = render(DEBIT_TX);
    expect(html).toMatch(/\bTo\b/);
  });

  it("renders counterparty email", () => {
    const html = render(DEBIT_TX);
    expect(html).toMatch(/bob@example\.com/);
  });

  it("renders is-debit class on amount", () => {
    const html = render(DEBIT_TX);
    expect(html).toMatch(/is-debit/);
  });

  it("renders Paid stamp text", () => {
    const html = render(DEBIT_TX);
    expect(html).toMatch(/Paid/);
  });
});

// ---------------------------------------------------------------------------
// Memo / reason
// ---------------------------------------------------------------------------

describe("TransactionReceipt — memo", () => {
  it("renders reason string when provided", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Birthday gift/);
  });

  it("renders em-dash when reason is null", () => {
    const html = render(NO_REASON_TX);
    // Memo row should show — (em dash)
    expect(html).toMatch(/—/);
  });
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe("TransactionReceipt — structure", () => {
  it("renders close button with aria-label", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/aria-label="Close receipt"/);
  });

  it("renders Done button", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Done/);
  });

  it("renders View profile link to /users/<encoded-email>", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/\/users\/alice%40example\.com/);
    expect(html).toMatch(/View profile/);
  });

  it("renders transaction ID as auth code", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/txid-credit-001/);
  });

  it("renders Virly brand header", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Virly/);
  });

  it("renders barcode elements (tr-bar spans)", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/tr-bar/);
    expect(html).toMatch(/tr-space/);
  });

  it("renders footer text about no fees", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/No fees/);
  });

  it("renders transfer fee as zero", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Transfer fee/);
  });

  it("renders settled funds note", () => {
    const html = render(CREDIT_TX);
    expect(html).toMatch(/Settled/);
  });
});

// ---------------------------------------------------------------------------
// FX row
// ---------------------------------------------------------------------------

describe("TransactionReceipt — FX metadata", () => {
  it("renders Entered as row when fx.enteredAmount is set", () => {
    const html = render(FX_TX);
    expect(html).toMatch(/Entered as/);
    expect(html).toMatch(/54\.32/);
    expect(html).toMatch(/USD/);
  });

  it("omits Entered as row when no fx metadata", () => {
    const html = render(CREDIT_TX);
    expect(html).not.toMatch(/Entered as/);
  });
});
