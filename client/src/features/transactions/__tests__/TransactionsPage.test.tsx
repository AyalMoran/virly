/**
 * Tests for TransactionsPage.
 *
 * Requires MemoryRouter (none of the component's hooks use router, but
 * sub-components like TransactionList may use Link). No auth/currency context
 * needed — the component doesn't call useAuth or useCurrency directly.
 *
 * useEffect (API fetch) does not fire in renderToStaticMarkup. Initial state:
 * isLoading=true, so the Skeleton renders and the TransactionList is hidden.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TransactionsPage } from "../TransactionsPage.js";

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TransactionsPage />
    </MemoryRouter>
  );
}

describe("TransactionsPage", () => {
  describe("page header", () => {
    it("renders the Transactions title", () => {
      const html = render();
      expect(html).toMatch(/Transactions/);
    });
  });

  describe("filter form", () => {
    it("renders the filter bar form", () => {
      const html = render();
      expect(html).toMatch(/filter-bar/);
    });

    it("renders the counterparty email field", () => {
      const html = render();
      expect(html).toMatch(/Counterparty email/);
    });

    it("renders the email input with correct type", () => {
      const html = render();
      expect(html).toMatch(/type="email"/);
    });

    it("renders the email placeholder text", () => {
      const html = render();
      expect(html).toMatch(/name@example\.com/);
    });

    it("renders the Filter submit button", () => {
      const html = render();
      expect(html).toMatch(/>Filter</);
    });

    it("renders the Reset button", () => {
      const html = render();
      expect(html).toMatch(/Reset/);
    });

    it("renders form with noValidate", () => {
      const html = render();
      expect(html).toMatch(/novalidate/i);
    });
  });

  describe("loading state", () => {
    it("shows skeleton while loading (initial state)", () => {
      const html = render();
      // isLoading starts as true; Skeleton (Primitives) renders as class="printing"
      expect(html).toMatch(/printing/i);
    });

    it("does not show an error banner in initial state", () => {
      const html = render();
      // error starts as empty string, no ErrorBanner
      expect(html).not.toMatch(/error-banner/i);
    });
  });

  describe("layout", () => {
    it("renders page-stack wrapper", () => {
      const html = render();
      expect(html).toMatch(/page-stack/);
    });
  });
});
