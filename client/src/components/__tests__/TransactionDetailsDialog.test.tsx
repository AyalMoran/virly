import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CurrencyProvider } from "../../features/currency/CurrencyProvider.js";
import { TransactionDetailsDialog } from "../TransactionDetailsDialog.js";
import type { Transaction } from "../../lib/types.js";

function render(
  transaction: Transaction | null,
  onClose = () => {}
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CurrencyProvider initialCurrency="ILS" initialRates={null}>
        <TransactionDetailsDialog transaction={transaction} onClose={onClose} />
      </CurrencyProvider>
    </MemoryRouter>
  );
}

const SAMPLE_TX: Transaction = {
  id: "tx-dialog-01",
  amount: 180,
  counterpartyEmail: "alice@example.com",
  reason: "Test payment",
  date: "2026-06-20T14:00:00.000Z",
};

describe("TransactionDetailsDialog", () => {
  it("renders nothing when transaction is null", () => {
    const html = render(null);
    // AnimatePresence with null child produces no dialog markup
    expect(html).not.toMatch(/role="dialog"/);
    expect(html).not.toMatch(/alice@example\.com/);
  });

  it("renders dialog when transaction is provided", () => {
    const html = render(SAMPLE_TX);
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
  });

  it("renders the transaction receipt content inside dialog", () => {
    const html = render(SAMPLE_TX);
    expect(html).toMatch(/alice@example\.com/);
    expect(html).toMatch(/Test payment/);
  });

  it("renders presentation overlay", () => {
    const html = render(SAMPLE_TX);
    expect(html).toMatch(/role="presentation"/);
    expect(html).toMatch(/transaction-confirmation-overlay/);
  });

  it('dialog has aria-label "Transaction details"', () => {
    const html = render(SAMPLE_TX);
    expect(html).toMatch(/aria-label="Transaction details"/);
  });

  it("renders close button inside the dialog", () => {
    const html = render(SAMPLE_TX);
    expect(html).toMatch(/aria-label="Close receipt"/);
  });

  it("renders a debit transaction inside the dialog", () => {
    const debitTx: Transaction = {
      id: "tx-dialog-debit",
      amount: -75,
      counterpartyEmail: "bob@example.com",
      reason: "Groceries",
      date: "2026-06-18T09:00:00.000Z",
    };
    const html = render(debitTx);
    expect(html).toMatch(/bob@example\.com/);
    expect(html).toMatch(/Groceries/);
    expect(html).toMatch(/Money sent/);
  });
});
