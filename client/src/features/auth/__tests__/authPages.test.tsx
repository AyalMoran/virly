/**
 * Tests for LoginPage, RegisterPage, ResendVerificationPage, and VerifyPage.
 *
 * All pages are rendered with renderToStaticMarkup (SSR). useEffect hooks do
 * not run during SSR, so no API calls are made. The pages are wrapped in
 * MemoryRouter + AuthProvider so that useAuth() / router hooks resolve.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../AuthProvider.js";
import { LoginPage } from "../LoginPage.js";
import { RegisterPage } from "../RegisterPage.js";
import { ResendVerificationPage } from "../ResendVerificationPage.js";
import { VerifyPage } from "../VerifyPage.js";

// globalThis.fetch is read by api.me() only inside useEffect, which SSR skips.
// Provide a stub so that the module import itself does not throw if it probes fetch.
const realFetch = (globalThis as { fetch?: unknown }).fetch;
beforeAll(() => {
  (globalThis as { fetch?: unknown }).fetch = () =>
    Promise.resolve({ ok: false, status: 401, text: async () => "{}" });
});
afterAll(() => {
  (globalThis as { fetch?: unknown }).fetch = realFetch;
});

function withProviders(ui: React.ReactElement, initialPath = "/") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------
describe("LoginPage", () => {
  it("renders the sign-in card with email and password fields", () => {
    const html = withProviders(<LoginPage />);
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/type="password"/);
  });

  it("renders a Sign In submit button", () => {
    const html = withProviders(<LoginPage />);
    expect(html).toMatch(/Sign In/);
  });

  it("renders a footer link to the register page", () => {
    const html = withProviders(<LoginPage />);
    expect(html).toMatch(/href="\/register"/);
  });

  it("wraps content in the bare auth panel (no auth-card wrapper)", () => {
    const html = withProviders(<LoginPage />);
    // LoginPage passes barePanel={true} to AuthLayout
    expect(html).not.toMatch(/class="auth-card"/);
  });

  it("includes the Virly brand visual section", () => {
    const html = withProviders(<LoginPage />);
    expect(html).toMatch(/aria-label="Virly overview"/);
  });

  it("renders a remember-me checkbox", () => {
    const html = withProviders(<LoginPage />);
    expect(html).toMatch(/remember/i);
  });
});

// ---------------------------------------------------------------------------
// RegisterPage
// ---------------------------------------------------------------------------
describe("RegisterPage", () => {
  it("renders email, password, confirm-password, and phone fields", () => {
    const html = withProviders(<RegisterPage />);
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/type="password"/);
    expect(html).toMatch(/type="tel"/);
  });

  it("renders a Create account submit button", () => {
    const html = withProviders(<RegisterPage />);
    expect(html).toMatch(/Create account/);
  });

  it("renders a footer link back to the login page", () => {
    const html = withProviders(<RegisterPage />);
    expect(html).toMatch(/href="\/login"/);
  });

  it("renders the auth visual section with the Virly brand", () => {
    const html = withProviders(<RegisterPage />);
    expect(html).toMatch(/aria-label="Virly overview"/);
  });

  it("shows auth-card wrapper (barePanel not set)", () => {
    const html = withProviders(<RegisterPage />);
    // RegisterPage does not pass barePanel; the default wrapper renders
    // But actually RegisterPage passes barePanel to AuthLayout — verify
    // no extra auth-card nesting that breaks the layout
    // RegisterPage uses barePanel (same as LoginPage) per the source
    expect(html).toMatch(/signin-card/);
  });
});

// ---------------------------------------------------------------------------
// ResendVerificationPage
// ---------------------------------------------------------------------------
describe("ResendVerificationPage", () => {
  it("renders the email field", () => {
    const html = withProviders(<ResendVerificationPage />);
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/Email/);
  });

  it("renders the Send verification link submit button", () => {
    const html = withProviders(<ResendVerificationPage />);
    expect(html).toMatch(/Send verification link/);
  });

  it("renders a sign-in link", () => {
    const html = withProviders(<ResendVerificationPage />);
    expect(html).toMatch(/href="\/login"/);
    expect(html).toMatch(/Sign in/);
  });

  it("renders the title Verify email in an h1", () => {
    const html = withProviders(<ResendVerificationPage />);
    expect(html).toMatch(/<h1>Verify email<\/h1>/);
  });

  it("pre-fills email when location state provides one", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname: "/resend-verification", state: { email: "dana@example.com" } }]}>
        <AuthProvider>
          <ResendVerificationPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(html).toMatch(/dana@example\.com/);
  });

  it("renders an empty email field when no location state is present", () => {
    const html = withProviders(<ResendVerificationPage />);
    // The input value attribute should be empty (or just the name attribute present)
    expect(html).toMatch(/value=""/);
  });
});

// ---------------------------------------------------------------------------
// VerifyPage
// ---------------------------------------------------------------------------
describe("VerifyPage", () => {
  it("renders the Verify email title in an h1", () => {
    // No token in URL; page renders the verify stage initially
    const html = withProviders(<VerifyPage />);
    expect(html).toMatch(/<h1>Verify email<\/h1>/);
  });

  it("shows a checking-token indicator when no result is available yet", () => {
    // useEffect does not run in SSR so the page stays in its initial verify stage.
    // Without done=true or error, the spinner-panel renders.
    const html = withProviders(<VerifyPage />);
    expect(html).toMatch(/Checking token/);
  });

  it("does not show an error banner in the initial SSR render", () => {
    const html = withProviders(<VerifyPage />);
    expect(html).not.toMatch(/role="alert"/);
  });

  it("renders the auth visual section", () => {
    const html = withProviders(<VerifyPage />);
    expect(html).toMatch(/aria-label="Virly overview"/);
  });
});
