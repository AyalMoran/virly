/**
 * Account / auth fixtures. Clearly-fake, fixed values that match `@/lib/types`.
 */
import type {
  AuthSuccessResponse,
  ExchangeRatesResponse,
  User,
} from "@/lib/types";

export const userFixture: User = {
  id: "usr_test_0001",
  email: "test.user@virly.test",
  balance: 1250.0,
  role: "user",
  createdAt: "2026-01-15T09:00:00.000Z",
  personalDetailsId: "pd_test_0001",
  personalDetailsStatus: "provided",
  needsPersonalDetails: false,
};

export const authSuccessFixture: AuthSuccessResponse = {
  user: userFixture,
  csrfToken: "csrf-storybook-token",
};

export const ratesFixture: ExchangeRatesResponse = {
  baseCurrency: "ILS",
  supportedCurrencies: ["ILS", "USD", "EUR"],
  // units per 1 ILS (see convertIlsForDisplay)
  rates: { ILS: 1, USD: 0.27, EUR: 0.25 },
  provider: "storybook-fixture",
  fetchedAt: "2026-06-26T08:00:00.000Z",
  validForDate: "2026-06-26",
  expiresAt: "2026-06-27T08:00:00.000Z",
  isStale: false,
};
