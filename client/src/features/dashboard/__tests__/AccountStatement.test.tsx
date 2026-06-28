/**
 * Tests for AccountStatement.
 *
 * AccountStatement is a pure display component that uses react-router <Link>,
 * so we wrap it in MemoryRouter. useEffect does not run during
 * renderToStaticMarkup, making the component suitable for SSR testing.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AccountStatement } from "../AccountStatement.js";
import type { AccountSummary, Transaction } from "../../../lib/types.js";

function formatAmount(amount: number) {
  return `ILS ${amount.toFixed(2)}`;
}

function makeSummary(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    balance: 1000,
    personalDetails: {
      id: "pd-1",
      status: "provided",
      firstName: "Test",
      needsPersonalDetails: false
    },
    transactions: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    ...overrides
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    amount: 100,
    counterpartyEmail: "alice@example.com",
    date: "2024-06-01",
    reason: "lunch",
    ...overrides
  };
}

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("AccountStatement", () => {
  describe("header and metadata", () => {
    it("renders the brand name Virly", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary()}
          holderName="Alice"
          accountNumber="**** 1234"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Virly/);
    });

    it("renders the holder name", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary()}
          holderName="Bob Smith"
          accountNumber="**** 5678"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Bob Smith/);
    });

    it("renders the account number", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary()}
          holderName="Test"
          accountNumber="**** 9999"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/\*\*\*\* 9999/);
    });

    it("renders Account Statement label", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary()}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Account Statement/);
    });

    it("has aria-label on the section", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary()}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/aria-label="Account statement"/);
    });
  });

  describe("summary figures", () => {
    it("renders closing balance label", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary({ balance: 500 })}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Closing balance/);
    });

    it("renders formatted closing balance via formatAmount", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary({ balance: 750 })}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/ILS 750\.00/);
    });

    it("renders Brought forward, Money in, Money out labels", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary()}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Brought forward/);
      expect(html).toMatch(/Money in/);
      expect(html).toMatch(/Money out/);
    });

    it("computes money in from positive transactions", () => {
      const summary = makeSummary({
        balance: 200,
        transactions: [makeTx({ amount: 100, id: "tx-1" }), makeTx({ amount: 50, id: "tx-2" })]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      // Money in = 150
      expect(html).toMatch(/\+ILS 150\.00/);
    });

    it("computes money out from negative transactions", () => {
      const summary = makeSummary({
        balance: 850,
        transactions: [makeTx({ amount: -150, id: "tx-out" })]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/ILS 150\.00/);
    });
  });

  describe("empty state", () => {
    it("renders empty state title when no transactions", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary({ transactions: [] })}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/No transactions on this statement/);
    });

    it("renders Make a transfer link in empty state", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary({ transactions: [] })}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Make a transfer/);
      expect(html).toMatch(/href="\/transfer"/);
    });

    it("renders footer View all transactions link", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary({ transactions: [] })}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/View all transactions/);
      expect(html).toMatch(/href="\/transactions"/);
    });

    it("renders 0 entries in footer for empty statement", () => {
      const html = render(
        <AccountStatement
          summary={makeSummary({ transactions: [] })}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/0 entries/);
    });
  });

  describe("with transactions", () => {
    it("renders transaction counterparty email", () => {
      const summary = makeSummary({
        balance: 900,
        transactions: [makeTx({ counterpartyEmail: "bob@example.com" })]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/bob@example\.com/);
    });

    it("renders transaction reason when present", () => {
      const summary = makeSummary({
        balance: 900,
        transactions: [makeTx({ reason: "coffee repayment" })]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/coffee repayment/);
    });

    it("renders ledger column headers when transactions present", () => {
      const summary = makeSummary({
        balance: 100,
        transactions: [makeTx()]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Date/);
      expect(html).toMatch(/Description/);
      expect(html).toMatch(/Balance/);
    });

    it("renders singular 'entry' for exactly one transaction", () => {
      const summary = makeSummary({
        balance: 100,
        transactions: [makeTx()]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/1 entry/);
      expect(html).not.toMatch(/1 entries/);
    });

    it("renders plural 'entries' for multiple transactions", () => {
      const summary = makeSummary({
        balance: 200,
        transactions: [
          makeTx({ id: "tx-1", amount: 100 }),
          makeTx({ id: "tx-2", amount: 100 })
        ]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/2 entries/);
    });

    it("renders the period when transactions have dates", () => {
      const summary = makeSummary({
        balance: 100,
        transactions: [
          makeTx({ id: "tx-1", date: "2024-01-01" }),
          makeTx({ id: "tx-2", date: "2024-06-30" })
        ]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/Period/);
    });

    it("renders credit transaction with + prefix", () => {
      const summary = makeSummary({
        balance: 300,
        transactions: [makeTx({ amount: 300 })]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      expect(html).toMatch(/\+ILS/);
    });

    it("renders debit transaction with minus prefix", () => {
      const summary = makeSummary({
        balance: 700,
        transactions: [makeTx({ id: "tx-out", amount: -300 })]
      });
      const html = render(
        <AccountStatement
          summary={summary}
          holderName="Test"
          accountNumber="**** 0000"
          formatAmount={formatAmount}
          onSelectTransaction={() => {}}
        />
      );
      // The component uses − (minus sign entity)
      expect(html).toMatch(/−/);
    });
  });
});
