/**
 * Tests for AuthProvider and the useAuth hook.
 *
 * AuthProvider is an SSR-safe context provider. useEffect calls (api.me)
 * do not run during renderToStaticMarkup, so no fetch stub is needed here.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider, useAuth } from "../AuthProvider.js";

// ---------------------------------------------------------------------------
// AuthProvider rendering
// ---------------------------------------------------------------------------
describe("AuthProvider", () => {
  it("renders its children without crashing", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <span>hello</span>
      </AuthProvider>
    );
    expect(html).toContain("hello");
  });

  it("renders multiple children", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <p>first</p>
        <p>second</p>
      </AuthProvider>
    );
    expect(html).toContain("first");
    expect(html).toContain("second");
  });

  it("does not inject extra markup around children", () => {
    // The provider only wraps in Context.Provider which produces no DOM output
    const html = renderToStaticMarkup(
      <AuthProvider>
        <div id="only-child">content</div>
      </AuthProvider>
    );
    expect(html).toBe('<div id="only-child">content</div>');
  });
});

// ---------------------------------------------------------------------------
// useAuth — consumer component helper
// ---------------------------------------------------------------------------

// A minimal component that exercises useAuth and renders the context value shape.
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-field="isLoading">{String(auth.isLoading)}</span>
      <span data-field="isAuthenticated">{String(auth.isAuthenticated)}</span>
      <span data-field="user">{auth.user === null ? "null" : auth.user.email}</span>
    </div>
  );
}

describe("useAuth", () => {
  it("exposes isLoading=true and isAuthenticated=false on initial render (no me() call in SSR)", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    // Initial state: isLoading=true, user=null
    expect(html).toMatch(/data-field="isLoading">true/);
    expect(html).toMatch(/data-field="isAuthenticated">false/);
    expect(html).toMatch(/data-field="user">null/);
  });

  it("throws when called outside AuthProvider", () => {
    // Suppress expected React error output
    const originalError = console.error;
    console.error = () => {};

    function BadConsumer() {
      useAuth(); // should throw
      return <span />;
    }

    expect(() => renderToStaticMarkup(<BadConsumer />)).toThrow(
      "useAuth must be used within AuthProvider"
    );

    console.error = originalError;
  });
});
