/**
 * Tests for SettingsPage.
 *
 * Requires AuthProvider (useAuth) + CurrencyProvider (useCurrency) +
 * MemoryRouter (useNavigate). useEffect (personal-details fetch) does not run
 * in renderToStaticMarkup — initial state is isLoadingDetails=true, so the
 * Skeleton is shown and the form/detail list is hidden.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthProvider.js";
import { CurrencyProvider } from "../../currency/CurrencyProvider.js";
import { SettingsPage } from "../SettingsPage.js";

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthProvider>
        <CurrencyProvider>
          <SettingsPage />
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  describe("page heading", () => {
    it("renders the Settings title", () => {
      const html = render();
      expect(html).toMatch(/Settings/);
    });
  });

  describe("personal details section", () => {
    it("renders the Personal details card heading", () => {
      const html = render();
      expect(html).toMatch(/Personal details/);
    });

    it("renders the subtitle copy", () => {
      const html = render();
      expect(html).toMatch(/Keep your customer profile up to date/);
    });

    it("shows skeleton while loading (initial state)", () => {
      const html = render();
      // isLoadingDetails starts true; Skeleton (Primitives) renders as class="printing"
      expect(html).toMatch(/printing/i);
    });

    it("does not render the Edit button while loading", () => {
      const html = render();
      // Edit button is hidden while isLoadingDetails=true
      expect(html).not.toMatch(/>Edit</);
    });

    it("does not render the settings-profile-list while loading", () => {
      const html = render();
      // The personal-details dl has class "settings-profile-list" (not present while loading);
      // the Account card uses plain "profile-list", so we look for the settings-specific class.
      expect(html).not.toMatch(/settings-profile-list/);
    });
  });

  describe("account section", () => {
    it("renders the Account card heading", () => {
      const html = render();
      expect(html).toMatch(/<h2>Account<\/h2>/);
    });

    it("renders the Email label in the account card", () => {
      const html = render();
      expect(html).toMatch(/<dt>Email<\/dt>/);
    });

    it("renders the Balance label in the account card", () => {
      const html = render();
      expect(html).toMatch(/<dt>Balance<\/dt>/);
    });
  });

  describe("session section", () => {
    it("renders the Session card heading", () => {
      const html = render();
      expect(html).toMatch(/<h2>Session<\/h2>/);
    });

    it("renders the Sign out button", () => {
      const html = render();
      expect(html).toMatch(/Sign out/);
    });
  });

  describe("layout classes", () => {
    it("renders the settings-grid class", () => {
      const html = render();
      expect(html).toMatch(/settings-grid/);
    });

    it("renders the settings-details-card class", () => {
      const html = render();
      expect(html).toMatch(/settings-details-card/);
    });

    it("renders the settings-side-stack class", () => {
      const html = render();
      expect(html).toMatch(/settings-side-stack/);
    });
  });
});
