import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthLayout } from "../AuthLayout.js";

// AuthLayout is a pure presentational component: no hooks, no context.
// framer-motion is in the transformIgnorePatterns allow-list and SSR-renders fine.

describe("AuthLayout", () => {
  describe("structural landmarks", () => {
    it("renders a main element with the auth-page class", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="Welcome back">
          <span>child</span>
        </AuthLayout>
      );
      expect(html).toMatch(/<main class="auth-page"/);
    });

    it("renders the visual section with aria-label for screen readers", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="">
          <span />
        </AuthLayout>
      );
      expect(html).toMatch(/aria-label="Virly overview"/);
    });

    it("renders the brand mark inside the visual section", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="">
          <span />
        </AuthLayout>
      );
      expect(html).toMatch(/brand-mark/);
      expect(html).toMatch(/Virly/);
    });
  });

  describe("children", () => {
    it("renders children inside the panel", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="">
          <p id="child-sentinel">I am the child</p>
        </AuthLayout>
      );
      expect(html).toContain("I am the child");
    });

    it("wraps children in auth-card when barePanel is false (default)", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="Sub">
          <span>child</span>
        </AuthLayout>
      );
      expect(html).toMatch(/class="auth-card"/);
    });

    it("renders children directly without auth-card wrapper when barePanel is true", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="" barePanel>
          <span>bare child</span>
        </AuthLayout>
      );
      expect(html).not.toMatch(/class="auth-card"/);
      expect(html).toContain("bare child");
    });
  });

  describe("title and subtitle", () => {
    it("renders the title inside an h1", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Create account" subtitle="">
          <span />
        </AuthLayout>
      );
      expect(html).toMatch(/<h1>Create account<\/h1>/);
    });

    it("renders a subtitle paragraph when subtitle is non-empty", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="Please log in">
          <span />
        </AuthLayout>
      );
      expect(html).toMatch(/<p>Please log in<\/p>/);
    });

    it("omits the subtitle paragraph when subtitle is an empty string", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="">
          <span />
        </AuthLayout>
      );
      // Subtitle element should not appear (falsy empty string branch)
      expect(html).not.toMatch(/Please log in/);
    });
  });

  describe("visualText prop", () => {
    it("renders AnimatedText component when visualText is provided", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="" visualText="Virly">
          <span />
        </AuthLayout>
      );
      expect(html).toMatch(/auth-animated-brand/);
      // AnimatedText renders each character as a span; "V" must be present
      expect(html).toContain("V");
    });

    it("renders the balance card when visualText is omitted", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="">
          <span />
        </AuthLayout>
      );
      expect(html).toMatch(/auth-balance-card/);
      expect(html).toMatch(/Available balance/);
    });

    it("does not render the balance card when visualText is provided", () => {
      const html = renderToStaticMarkup(
        <AuthLayout title="Sign in" subtitle="" visualText="Virly">
          <span />
        </AuthLayout>
      );
      expect(html).not.toMatch(/auth-balance-card/);
    });
  });
});
