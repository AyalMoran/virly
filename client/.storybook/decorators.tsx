import type { Decorator } from "@storybook/react-vite";
import { MotionConfig } from "framer-motion";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { CurrencyProvider } from "@/features/currency/CurrencyProvider";
import type { DisplayCurrency } from "@/lib/types";
import { ratesFixture } from "./fixtures";

/**
 * Reusable decorators.
 *
 * `withMotion`, `withRouter`, `withCurrency` are safe for every story and are
 * registered globally in preview.tsx. `withAuth` is opt-in (per meta/story)
 * because it mounts the real AuthProvider, which fetches `/api/auth/me` — only
 * components that read `useAuth()` need it, and it relies on the global MSW
 * handler returning a logged-in test user.
 */

/** Freeze framer-motion at its final frame so screenshots are deterministic. */
export const withMotion: Decorator = (Story) => (
  <MotionConfig reducedMotion="always">
    <Story />
  </MotionConfig>
);

/** MemoryRouter so <Link>/router hooks render in isolation. Override the
 *  initial location via `parameters.router.initialEntries`. */
export const withRouter: Decorator = (Story, context) => {
  const initialEntries =
    (context.parameters.router?.initialEntries as string[] | undefined) ?? ["/"];
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Story />
    </MemoryRouter>
  );
};

/** Provide currency context with fixed rates (no network). Override the active
 *  display currency via `parameters.currency`. */
export const withCurrency: Decorator = (Story, context) => {
  const currency = (context.parameters.currency as DisplayCurrency) ?? "ILS";
  return (
    <CurrencyProvider initialCurrency={currency} initialRates={ratesFixture}>
      <Story />
    </CurrencyProvider>
  );
};

/** Mount the real AuthProvider (logged-in via the MSW `/api/auth/me` handler). */
export const withAuth: Decorator = (Story) => (
  <AuthProvider>
    <Story />
  </AuthProvider>
);
