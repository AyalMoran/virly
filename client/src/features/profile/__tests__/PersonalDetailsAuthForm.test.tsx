/**
 * Tests for PersonalDetailsAuthForm.
 *
 * The component uses useAuth (must be inside AuthProvider) and Framer Motion
 * animation wrappers. No router dependency.
 *
 * useEffect does not fire during renderToStaticMarkup, so API calls are
 * never triggered. We assert on initial-state markup only.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../../auth/AuthProvider.js";
import { PersonalDetailsAuthForm } from "../PersonalDetailsAuthForm.js";

function render(onComplete: () => void = () => {}) {
  return renderToStaticMarkup(
    <AuthProvider>
      <PersonalDetailsAuthForm onComplete={onComplete} />
    </AuthProvider>
  );
}

describe("PersonalDetailsAuthForm", () => {
  describe("heading and branding", () => {
    it("renders the Personal details heading", () => {
      const html = render();
      expect(html).toMatch(/Personal details/);
    });

    it("renders the Virly logo mark", () => {
      const html = render();
      // Logo is the letter V inside a div
      expect(html).toMatch(/signin-logo/);
    });
  });

  describe("form fields", () => {
    it("renders a First name input", () => {
      const html = render();
      expect(html).toMatch(/First name/);
      expect(html).toMatch(/id="personal-firstName"/);
    });

    it("renders a Last name input", () => {
      const html = render();
      expect(html).toMatch(/Last name/);
      expect(html).toMatch(/id="personal-lastName"/);
    });

    it("renders a Date of birth input with type date", () => {
      const html = render();
      expect(html).toMatch(/Date of birth/);
      expect(html).toMatch(/id="personal-dateOfBirth"/);
      expect(html).toMatch(/type="date"/);
    });

    it("renders a Country input", () => {
      const html = render();
      expect(html).toMatch(/Country/);
      expect(html).toMatch(/id="personal-country"/);
    });

    it("renders a City input", () => {
      const html = render();
      expect(html).toMatch(/City/);
      expect(html).toMatch(/id="personal-city"/);
    });

    it("renders a Street input", () => {
      const html = render();
      expect(html).toMatch(/Street/);
      expect(html).toMatch(/id="personal-street"/);
    });

    it("renders an Address line 2 input", () => {
      const html = render();
      expect(html).toMatch(/Address line 2/);
      expect(html).toMatch(/id="personal-addressLine2"/);
    });

    it("renders a Postal code input", () => {
      const html = render();
      expect(html).toMatch(/Postal code/);
      expect(html).toMatch(/id="personal-postalCode"/);
    });

    it("renders a State / region input", () => {
      const html = render();
      expect(html).toMatch(/State \/ region/);
      expect(html).toMatch(/id="personal-stateRegion"/);
    });
  });

  describe("submit and skip buttons", () => {
    it("renders the Save details submit button", () => {
      const html = render();
      expect(html).toMatch(/Save details/);
    });

    it("renders the Skip for now button", () => {
      const html = render();
      expect(html).toMatch(/Skip for now/);
    });

    it("submit button is not disabled on initial render", () => {
      const html = render();
      // Button is type="submit" and initially isSubmitting=false, isSkipping=false
      expect(html).not.toMatch(/disabled=""/);
    });
  });

  describe("form attributes", () => {
    it("renders the form with noValidate", () => {
      const html = render();
      expect(html).toMatch(/novalidate/i);
    });

    it("renders the profile-auth-form class", () => {
      const html = render();
      expect(html).toMatch(/profile-auth-form/);
    });

    it("renders the signin-card class", () => {
      const html = render();
      expect(html).toMatch(/signin-card/);
    });
  });

  describe("no initial errors", () => {
    it("does not render any error message on initial load", () => {
      const html = render();
      expect(html).not.toMatch(/signin-error/);
      expect(html).not.toMatch(/signin-field-error/);
    });
  });

  describe("autocomplete attributes", () => {
    it("has given-name autocomplete on firstName", () => {
      const html = render();
      // React SSR serialises the autoComplete prop as camelCase in the HTML string
      expect(html).toMatch(/autoComplete="given-name"/);
    });

    it("has family-name autocomplete on lastName", () => {
      const html = render();
      expect(html).toMatch(/autoComplete="family-name"/);
    });

    it("has bday autocomplete on dateOfBirth", () => {
      const html = render();
      expect(html).toMatch(/autoComplete="bday"/);
    });
  });
});
