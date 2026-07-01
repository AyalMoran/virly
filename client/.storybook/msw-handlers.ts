import { http, HttpResponse } from "msw";
import {
  accountSummaryFixture,
  authSuccessFixture,
  personalDetailsResponseFixture,
  ratesFixture,
  relationshipTransactionsResponseFixture,
  transactionsResponseFixture,
  userProfileFixture,
} from "./fixtures";

/**
 * Default GET handlers applied to every story (overridable per-story via
 * `parameters.msw.handlers`). The leading `*` matches regardless of the API
 * base URL the app was built with (defaults to http://localhost:3000), so no
 * story ever reaches a real backend. Only read endpoints fired on initial
 * render are mocked here; write endpoints are exercised by user interaction and
 * stubbed per-story when a story needs them.
 */
export const defaultHandlers = [
  http.get("*/api/auth/me", () => HttpResponse.json(authSuccessFixture)),
  http.get("*/api/exchange-rates/current", () => HttpResponse.json(ratesFixture)),
  http.get("*/api/accounts/me", () => HttpResponse.json(accountSummaryFixture)),
  http.get("*/api/accounts/personal-details", () =>
    HttpResponse.json(personalDetailsResponseFixture),
  ),
  http.get("*/api/transactions", () =>
    HttpResponse.json(transactionsResponseFixture),
  ),
  http.get("*/api/users/:idOrEmail/profile", () =>
    HttpResponse.json(userProfileFixture),
  ),
  http.get("*/api/users/:idOrEmail/transactions", () =>
    HttpResponse.json(relationshipTransactionsResponseFixture),
  ),
];
