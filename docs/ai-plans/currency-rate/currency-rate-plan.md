# Goal

Add multi-currency display and transfer input support to the Virly cash-transfer app while keeping ILS as the only true database and ledger currency.

The feature must let users view monetary amounts in ILS, USD, or EUR through a currency selector placed in the top-right area of the main page header. The selected currency should affect display formatting across the app, but all persisted balances, transaction amounts, transfer amounts, account values, limits, and ledger calculations must remain stored and computed in ILS.

## Core requirements

1. Add a currency selector dropdown to the top-right of the app header.
   - Supported currencies: ILS, USD, EUR.
   - Default currency: ILS.
   - Persist the selected display currency client-side, preferably in localStorage.
   - The selector should be globally available so pages can render amounts consistently.

2. Preserve ILS as the source of truth.
   - Database amounts remain ILS only.
   - Backend validation, transfer limits, balance checks, transaction creation, and account updates must all use ILS.
   - Do not store converted display amounts as authoritative financial data.
   - Do not let frontend-only conversion determine the actual transfer amount.

3. Add exchange-rate infrastructure on the backend.
   - Use a reliable external exchange-rate vendor through a server-side API call.
   - Provider should be configurable through environment variables.
   - Recommended default provider: ExchangeRate-API, unless the project already has another approved vendor.
   - Never expose the provider API key to the frontend.
   - Fetch rates from an ILS base if supported. Otherwise fetch from a supported base and normalize rates into ILS-based conversion values.
   - Required conversions:
     - ILS to USD
     - ILS to EUR
     - USD to ILS
     - EUR to ILS
     - USD to EUR
     - EUR to USD, if needed for display consistency.

4. Cache exchange rates in MongoDB.
   - Create an appropriate collection/model, preferably `exchange_rates`, `fx_rates`, or `internal_exchange_rates`.
   - Suggested schema:
     - `baseCurrency`
     - `rates`
     - `provider`
     - `fetchedAt`
     - `validForDate`
     - `expiresAt`
     - `sourceResponseHash` or metadata field
     - `createdAt`
     - `updatedAt`
   - Keep the newest successful rate snapshot.
   - Do not call the vendor on every user request.
   - Refresh rates at most once per day.
   - If today’s rate already exists and is not expired, use the cached value.
   - If the vendor call fails, use the latest non-expired cached rate if available.
   - If no usable rate exists, degrade safely by showing ILS only or a clear “conversion unavailable” state.

5. Add backend endpoints/services.
   - Add an internal FX service responsible for fetching, caching, normalizing, and returning exchange rates.
   - Add a public authenticated endpoint such as:
     - `GET /api/exchange-rates/current`
   - Response should include:
     - selected supported currencies
     - base currency
     - rates
     - provider
     - fetchedAt
     - expiresAt
   - Validate that only ILS, USD, and EUR are exposed to the client.

6. Update frontend amount rendering.
   - Create a reusable money formatter/helper.
   - Inputs:
     - amount in ILS
     - selected display currency
     - cached rates
   - Output:
     - formatted amount in selected currency
   - For ILS, display the original amount directly.
   - For USD/EUR, display converted values using the cached daily rate.
   - Include sensible rounding:
     - display amounts: 2 decimal places
     - internal calculations: avoid floating-point precision bugs by using integer minor units or decimal-safe arithmetic.

7. Update transfer flow.
   - The transfer form should allow the user to choose ILS, USD, or EUR as the input currency.
   - If the user enters a transfer amount in USD or EUR:
     - Convert it server-side into the actual ILS amount.
     - Validate the ILS amount against balance, limits, and transfer rules.
     - Store and execute the transfer in ILS.
   - In the transfer confirmation screen, show:
     - the user-entered amount and currency prominently
     - the actual ILS amount that will be transferred in small print
     - the exchange rate used
     - the rate timestamp
   - Example:
     - `$50.00 USD`
     - small print: `Actual transfer amount: ₪185.40 ILS, using USD → ILS rate from 2026-06-11`
   - For ILS transfers, no small-print conversion is required.

8. Update transaction display.
   - Existing transactions should remain stored in ILS.
   - When viewing transactions in USD/EUR, show converted display amounts only.
   - Avoid implying that historical transactions originally happened in USD/EUR unless the app stores the original user-selected currency as metadata.
   - Optional metadata for new transfers:
     - `enteredCurrency`
     - `enteredAmount`
     - `exchangeRateUsed`
     - `exchangeRateFetchedAt`
     - `settledAmountIls`
   - The authoritative transaction amount remains `amountIls`.

9. Add safety and correctness constraints.
   - Never trust frontend conversion for money movement.
   - All transfer quote and confirmation calculations must happen on the backend.
   - The conversion rate used for confirmation must match the rate used for execution.
   - If the rate changes between quote and confirmation, require a refreshed quote before executing.
   - Add tests for stale rates, missing rates, unsupported currencies, failed provider calls, and transfer conversion.

10. Testing requirements.
   - Backend unit tests:
     - FX service fetches once per day.
     - FX service uses cached rates.
     - unsupported currencies are rejected.
     - USD/EUR transfer input converts to ILS correctly.
     - transfer validation uses ILS.
   - Frontend tests:
     - header dropdown appears top-right.
     - selected currency persists.
     - amounts render in selected currency.
     - transfer confirmation shows actual ILS amount in small print for USD/EUR.
   - Integration tests:
     - create transfer quote in USD/EUR.
     - confirm transfer.
     - verify database stores ILS amount as source of truth.

## Expected outcome

Virly supports ILS, USD, and EUR display and transfer input while preserving ILS as the only authoritative ledger currency. Users can view the app in another currency, but every real financial operation remains validated, stored, and executed in ILS using a server-side daily exchange-rate snapshot.