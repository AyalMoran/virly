/**
 * RouteGuards tests.
 *
 * In native-ESM Jest mode (--experimental-vm-modules), jest.mock() is not
 * available as a global. We use jest.unstable_mockModule + dynamic import
 * instead, which is the correct ESM-compatible pattern.
 */
import { jest } from "@jest/globals";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { User } from "../../lib/types.js";

// Shared mock factory — replaced via mockReturnValue per test.
const mockUseAuth = jest.fn();

// Module mock must come before the dynamic import below.
jest.unstable_mockModule("../../features/auth/AuthProvider.js", () => ({
  useAuth: mockUseAuth,
}));

// Dynamic import executes AFTER the mock is installed.
const { ProtectedRoute, GuestRoute } = await import("../RouteGuards.js");

const BASE_USER: User = {
  id: "u1",
  email: "user@example.com",
  balance: 0,
  role: "user",
  personalDetailsId: "pd1",
  personalDetailsStatus: "not_provided",
  needsPersonalDetails: false,
};

function renderRoute(
  element: React.ReactElement,
  initialPath = "/"
): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// ProtectedRoute
// ---------------------------------------------------------------------------

describe("ProtectedRoute", () => {
  it("renders nothing while auth is loading", () => {
    mockUseAuth.mockReturnValue({ isLoading: true, isAuthenticated: false, user: null });
    const html = renderRoute(
      <ProtectedRoute>
        <span>Secret</span>
      </ProtectedRoute>
    );
    expect(html).toBe("");
  });

  it("does not render children when not authenticated", () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, user: null });
    const html = renderRoute(
      <ProtectedRoute>
        <span>Secret</span>
      </ProtectedRoute>
    );
    expect(html).not.toMatch(/Secret/);
  });

  it("renders children when authenticated", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: BASE_USER,
    });
    const html = renderRoute(
      <ProtectedRoute>
        <span>Dashboard content</span>
      </ProtectedRoute>
    );
    expect(html).toMatch(/Dashboard content/);
  });

  it("renders children with extra HTML elements when authenticated", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: BASE_USER,
    });
    const html = renderRoute(
      <ProtectedRoute>
        <section>
          <h1>Welcome</h1>
          <p>Your balance is ready.</p>
        </section>
      </ProtectedRoute>
    );
    expect(html).toMatch(/Welcome/);
    expect(html).toMatch(/Your balance is ready/);
  });
});

// ---------------------------------------------------------------------------
// GuestRoute
// ---------------------------------------------------------------------------

describe("GuestRoute", () => {
  it("renders nothing while auth is loading", () => {
    mockUseAuth.mockReturnValue({ isLoading: true, isAuthenticated: false, user: null });
    const html = renderRoute(
      <GuestRoute>
        <span>Login form</span>
      </GuestRoute>,
      "/login"
    );
    expect(html).toBe("");
  });

  it("renders children for unauthenticated users", () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, user: null });
    const html = renderRoute(
      <GuestRoute>
        <span>Login form</span>
      </GuestRoute>,
      "/login"
    );
    expect(html).toMatch(/Login form/);
  });

  it("does not render children when authenticated user visits a non-login path", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: BASE_USER,
    });
    const html = renderRoute(
      <GuestRoute>
        <span>Register form</span>
      </GuestRoute>,
      "/register"
    );
    expect(html).not.toMatch(/Register form/);
  });

  it("redirects authenticated users without needsPersonalDetails away from /login", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { ...BASE_USER, needsPersonalDetails: false },
    });
    const html = renderRoute(
      <GuestRoute>
        <span>Login form</span>
      </GuestRoute>,
      "/login"
    );
    expect(html).not.toMatch(/Login form/);
  });

  it("allows authenticated user through on /login when needsPersonalDetails is true", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { ...BASE_USER, needsPersonalDetails: true },
    });
    // location.state is null so hasAuthTransition is false; but needsPersonalDetails is true
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: null }]}>
        <Routes>
          <Route
            path="*"
            element={
              <GuestRoute>
                <span>Login form</span>
              </GuestRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(html).toMatch(/Login form/);
  });

  it("renders children on /login path for anonymous user", () => {
    mockUseAuth.mockReturnValue({ isLoading: false, isAuthenticated: false, user: null });
    const html = renderRoute(
      <GuestRoute>
        <div>
          <h2>Sign in</h2>
          <p>Use your email and password.</p>
        </div>
      </GuestRoute>,
      "/login"
    );
    expect(html).toMatch(/Sign in/);
    expect(html).toMatch(/Use your email and password/);
  });
});
