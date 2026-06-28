/**
 * Tests for DashboardPage.
 *
 * Requires AuthProvider (useAuth), CurrencyProvider (useCurrency), and
 * MemoryRouter (useLocation, useNavigate). useEffect (API fetch, realtime
 * connect) does not fire in renderToStaticMarkup.
 *
 * Initial state: isLoading=true, summary=null, enteredFromAuth derived from
 * location.state (no state in MemoryRouter → false). The Skeleton renders
 * and the AccountStatement/QuickContacts cards are hidden.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthProvider.js";
import { CurrencyProvider } from "../../currency/CurrencyProvider.js";
import { DashboardPage } from "../DashboardPage.js";

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthProvider>
        <CurrencyProvider>
          <DashboardPage />
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  describe("page header", () => {
    it("renders a Hello greeting", () => {
      const html = render();
      // greetingName falls back to getUsername(auth.user?.email)
      // auth.user is null initially so greetingName = "user"
      expect(html).toMatch(/Hello/);
    });

    it("renders the Transfer button linking to /transfer", () => {
      const html = render();
      expect(html).toMatch(/href="\/transfer"/);
      expect(html).toMatch(/Transfer/);
    });
  });

  describe("loading state", () => {
    it("renders a skeleton while loading (initial state)", () => {
      const html = render();
      // isLoading=true on mount; Skeleton (Primitives) renders as class="printing"
      expect(html).toMatch(/printing/i);
    });

    it("does not render the AccountStatement while loading", () => {
      const html = render();
      expect(html).not.toMatch(/Account statement/i);
    });

    it("does not render an error banner in the initial state", () => {
      const html = render();
      // error is '' initially
      expect(html).not.toMatch(/error-banner/i);
    });
  });

  describe("layout", () => {
    it("renders the dashboard-page class", () => {
      const html = render();
      expect(html).toMatch(/dashboard-page/);
    });

    it("renders the page-stack class", () => {
      const html = render();
      expect(html).toMatch(/page-stack/);
    });
  });
});
