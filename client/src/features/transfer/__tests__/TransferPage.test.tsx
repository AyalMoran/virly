/**
 * Tests for TransferPage.
 *
 * Requires AuthProvider (useAuth), CurrencyProvider (useCurrency), and
 * MemoryRouter (useNavigate). useEffect (account summary fetch) does not fire
 * in renderToStaticMarkup, so we assert on initial state: step="form",
 * isLoading=false (no explicit loading state on this page), empty fields.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthProvider.js";
import { CurrencyProvider } from "../../currency/CurrencyProvider.js";
import { TransferPage } from "../TransferPage.js";

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthProvider>
        <CurrencyProvider>
          <TransferPage />
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("TransferPage", () => {
  describe("page heading", () => {
    it("renders the Transfer eyebrow", () => {
      const html = render();
      expect(html).toMatch(/Transfer/);
    });

    it("renders the Write a cheque title", () => {
      const html = render();
      expect(html).toMatch(/Write a cheque/);
    });
  });

  describe("form step (initial)", () => {
    it("renders the cheque form shell", () => {
      const html = render();
      expect(html).toMatch(/cheque-shell/);
    });

    it("renders the Review cheque submit button", () => {
      const html = render();
      expect(html).toMatch(/Review cheque/);
    });

    it("does not show an error banner in the initial state", () => {
      const html = render();
      // errors.form is undefined initially
      expect(html).not.toMatch(/error-banner/i);
    });
  });

  describe("balance aside", () => {
    it("renders the Balance aside section", () => {
      const html = render();
      expect(html).toMatch(/Balance/);
    });

    it("renders the balance-aside element", () => {
      const html = render();
      expect(html).toMatch(/balance-aside/);
    });

    it("renders the After transfer projection label", () => {
      const html = render();
      // "After transfer" is only shown when step !== "success"
      expect(html).toMatch(/After transfer/);
    });
  });

  describe("layout", () => {
    it("renders the cheque-layout class", () => {
      const html = render();
      expect(html).toMatch(/cheque-layout/);
    });

    it("renders a cheque-panel div", () => {
      const html = render();
      expect(html).toMatch(/cheque-panel/);
    });
  });

  describe("cheque cheque step", () => {
    it("renders the cheque-step wrapper", () => {
      const html = render();
      expect(html).toMatch(/cheque-step/);
    });

    it("renders the cheque-actions area", () => {
      const html = render();
      expect(html).toMatch(/cheque-actions/);
    });
  });
});
