# Backend area: Exchange rates / FX

> The current-rates snapshot endpoint and the FX service behind it. Mounted at
> `/api/exchange-rates`. See [`../index.md`](../index.md) for layering.

**Router:** `server/src/routes/exchangeRate.routes.ts`
**Service:** `server/src/services/fx.service.ts`
**Model:** `server/src/models/ExchangeRate.ts` (cache backing, via the seam)

## Endpoints

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| GET | `/api/exchange-rates/current` | Yes | `fx.service.getCurrentRates` | Returns the base currency (ILS), `SUPPORTED_CURRENCIES`, the rate map, provider, fetch/validity timestamps, and `isStale`. |

Request/response body: [API reference §1 (Exchange Rates)](../../api/README.md#1-endpoint-groups).

## Layer walk

- **Route** calls `getCurrentRates()`, then trims the snapshot to exactly the
  supported display currencies before responding. It never fetches from the
  provider directly.
- **Service** (`fx.service.ts`) owns all FX logic: the supported-currency set
  (`SUPPORTED_CURRENCIES`, base `FX_BASE_CURRENCY = "ILS"`), provider fetch with
  caching, staleness detection, and the quote builders (`buildTransferQuote`)
  consumed by the [Transactions/Transfers](transactions-transfers.md) area.
- **Repository/cache** — rate snapshots are persisted via the `exchangeRates`
  seam interface (Mongo backing `models/ExchangeRate.ts`), so a fresh process
  can serve a cached rate and avoid hammering the provider.

## Cross-cutting

- Requires `requireAuth` (read-only, no CSRF since it is a GET).
- When the provider is unavailable and no usable cache exists, FX-dependent
  flows surface `503` (e.g. a non-ILS transfer quote) — see
  [Transactions/Transfers](transactions-transfers.md) and
  [API reference §3](../../api/README.md#3-error-envelope).
