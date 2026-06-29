import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CurrencyProvider } from "../../features/currency/CurrencyProvider.js";
import { TransactionList } from "../TransactionList.js";
import type { Transaction, Pagination } from "../../lib/types.js";

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CurrencyProvider initialCurrency="ILS" initialRates={null}>
        {ui}
      </CurrencyProvider>
    </MemoryRouter>
  );
}

const TX_CREDIT: Transaction = {
  id: "tx-credit",
  amount: 200,
  counterpartyEmail: "alice@example.com",
  reason: "Rent share",
  date: "2026-06-01T10:00:00.000Z",
};

const TX_DEBIT: Transaction = {
  id: "tx-debit",
  amount: -50,
  counterpartyEmail: "bob@example.com",
  reason: "",
  date: "2026-06-02T12:00:00.000Z",
};

const PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 25,
  totalPages: 2,
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("TransactionList — empty state", () => {
  it("renders empty state when transactions array is empty", () => {
    const html = render(
      <TransactionList transactions={[]} />
    );
    expect(html).toMatch(/No transactions/);
  });

  it("renders a Transfer link in the empty state", () => {
    const html = render(
      <TransactionList transactions={[]} />
    );
    expect(html).toMatch(/\/transfer/);
    expect(html).toMatch(/Transfer/);
  });

  it("does not render transaction rows in empty state", () => {
    const html = render(
      <TransactionList transactions={[]} />
    );
    expect(html).not.toMatch(/transaction-row/);
  });
});

// ---------------------------------------------------------------------------
// Transaction rows
// ---------------------------------------------------------------------------

describe("TransactionList — transaction rows", () => {
  it("renders counterparty email for each transaction", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT, TX_DEBIT]} />
    );
    expect(html).toMatch(/alice@example\.com/);
    expect(html).toMatch(/bob@example\.com/);
  });

  it("marks credit transaction with direction-in class", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/direction-in/);
  });

  it("marks debit transaction with direction-out class", () => {
    const html = render(
      <TransactionList transactions={[TX_DEBIT]} />
    );
    expect(html).toMatch(/direction-out/);
  });

  it("renders '+' sign prefix for credit", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/\+/);
  });

  it("marks credit amount with amount-credit class", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/amount-credit/);
  });

  it("marks debit amount with amount-debit class", () => {
    const html = render(
      <TransactionList transactions={[TX_DEBIT]} />
    );
    expect(html).toMatch(/amount-debit/);
  });

  it("renders reason when provided", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/Rent share/);
  });

  it("renders Completed status label", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/Completed/);
  });

  it("renders counterparty profile links", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/\/users\/alice%40example\.com/);
  });

  it("renders aria-label on profile link", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).toMatch(/View alice@example\.com&#x27;s profile|View alice@example\.com's profile/);
  });
});

// ---------------------------------------------------------------------------
// Compact mode
// ---------------------------------------------------------------------------

describe("TransactionList — compact mode", () => {
  it("adds compact class in compact mode", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} compact />
    );
    expect(html).toMatch(/transaction-list compact/);
  });

  it("omits compact class by default", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    const classMatch = html.match(/class="transaction-list([^"]*)"/);
    expect(classMatch?.[1] ?? "").not.toMatch(/compact/);
  });
});

// ---------------------------------------------------------------------------
// Selectable rows
// ---------------------------------------------------------------------------

describe("TransactionList — selectable rows", () => {
  it("adds selectable class and role=button when onTransactionSelect provided", () => {
    const html = render(
      <TransactionList
        transactions={[TX_CREDIT]}
        onTransactionSelect={() => {}}
      />
    );
    expect(html).toMatch(/selectable/);
    expect(html).toMatch(/role="button"/);
  });

  it("does not add role=button when onTransactionSelect is absent", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).not.toMatch(/role="button"/);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("TransactionList — pagination", () => {
  it("renders pagination nav when pagination, page, and onPageChange all provided", () => {
    const html = render(
      <TransactionList
        transactions={[TX_CREDIT]}
        pagination={PAGINATION}
        page={1}
        onPageChange={() => {}}
      />
    );
    expect(html).toMatch(/Transactions pages/);
    expect(html).toMatch(/Previous/);
    expect(html).toMatch(/Next/);
  });

  it("disables Previous button on first page", () => {
    const html = render(
      <TransactionList
        transactions={[TX_CREDIT]}
        pagination={PAGINATION}
        page={1}
        onPageChange={() => {}}
      />
    );
    // First button (Previous) should be disabled
    const match = html.match(/<button[^>]*>Previous<\/button>/);
    expect(match?.[0]).toMatch(/disabled/);
  });

  it("disables Next button on last page", () => {
    const html = render(
      <TransactionList
        transactions={[TX_CREDIT]}
        pagination={{ ...PAGINATION, page: 2, totalPages: 2 }}
        page={2}
        onPageChange={() => {}}
      />
    );
    const match = html.match(/<button[^>]*>Next<\/button>/);
    expect(match?.[0]).toMatch(/disabled/);
  });

  it("omits pagination when pagination prop is absent", () => {
    const html = render(
      <TransactionList transactions={[TX_CREDIT]} />
    );
    expect(html).not.toMatch(/pagination/);
  });

  it("shows page X of Y text", () => {
    const html = render(
      <TransactionList
        transactions={[TX_CREDIT]}
        pagination={PAGINATION}
        page={1}
        onPageChange={() => {}}
      />
    );
    expect(html).toMatch(/Page 1 of 2/);
  });
});
