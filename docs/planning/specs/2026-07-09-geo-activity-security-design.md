# Geo Activity Security (GIS integration) - Design

- Date: 2026-07-09
- Status: Approved design, awaiting implementation plan
- Owner: Ayal

## Context

Virly is branded as a bank but behaves like a cash transfer app: money moves between users by email, with no cards, merchants, or branches.
That means the only location that matters is where the user is when they act, at login and at transfer time.
Today the codebase has no geographic capability at all: no coordinates, no map libraries, no IP geolocation, and no geo signals in the fraud scorer.
The live risk scorer (`server/src/fraud/risk.ts`) covers counterparty novelty, amount, limits, spikes, odd hours, and a kNN anomaly score, but none of the geo rules real banks rely on.

This design adds a location-aware security layer with three consumers, in priority order:

1. Geo fraud signals (primary): impossible travel, new country, far from home.
2. A user-facing "Security" activity view with a map of recent account activity.
3. AI assistant tools that can answer location questions about the user's own activity.

## Goals

- Stamp logins and transfers with a best-effort location derived from the request IP.
- Add explainable geo rules to `computeRisk` so geo risk feeds the existing score, reasons, and email-confirmation holds (ADR 0012) with no new hold machinery.
- Show the user their own recent located activity as a list plus a map, and alert other active sessions in realtime on suspicious logins.
- Give the v2 assistant and the Support MCP server read-only access to located activity.
- Keep all data access behind the repository seam with mongo/postgres contract parity.

## Non-goals

- No browser Geolocation API, GPS, or client-supplied coordinates; the client is untrusted for fraud purposes.
- No geospatial database indexes (PostGIS, 2dsphere); every query is per-user over small N, so geo math lives in pure TypeScript.
- No cross-user spatial queries (fraud-ring clustering, ops heatmaps); noted as a future extension.
- No branch or ATM locator; Virly has no branches.
- No user opt-out of capture; an opt-out would be the first thing a fraudster toggles.

## Decision summary

Chosen architecture: a unified activity-event stream plus pure-TypeScript geo domain logic.

Rejected alternatives:

- Stamping geo fields onto `Transaction` plus a separate login log: fewer collections, but every consumer would union two differently shaped sources, and the ledger schema would absorb a security concern.
- A full geospatial backbone (PostGIS and 2dsphere behind contract-tested geo queries): architecturally impressive, but no current feature needs cross-user spatial queries; capability would be bought before any feature demands it.
The repository interface keeps the door open to add native geo queries later without touching consumers.

## Data model

One new domain concept, written through the repository seam:

```ts
ActivityEvent {
  id: string                      // 24-hex ObjectId string in both drivers (ADR 0002)
  userId: string
  kind: "login" | "transfer"
  at: Date
  ip: string | null
  geo: { country: string; city: string | null; lat: number; lng: number } | null
  transactionId: string | null    // set when kind = "transfer"
}
```

- `geo.country` is ISO 3166-1 alpha-2.
- Events are always written, even when geolocation fails; the stream is the audit trail and geo is enrichment.
- Repository interface (in `server/src/repositories/types.ts`):
  - `create(event)`
  - `listRecentByUser(userId, { limit, before })` with cursor semantics, never offset pagination.
  - `deleteOlderThan(cutoff)` for retention.
- Retention: `VIRLY_ACTIVITY_RETENTION_DAYS`, default 180.
  Mongo expires rows via a native TTL index on `at`; Postgres reuses the existing boot-time TTL sweeper pattern.
- Both drivers join the contract suite: create, ordering, cursor paging, and retention deletion must behave identically.

## Geolocation

A `GeoIpResolver` port with three implementations, selected at boot:

- `MaxMindResolver`: loads a local `GeoLite2-City.mmdb` from `VIRLY_GEOIP_DB_PATH`.
  A new `npm run geo:sync` server script downloads the database using `VIRLY_MAXMIND_LICENSE_KEY`, mirroring the `rag:sync` pattern.
  The mmdb file is gitignored.
  A missing or corrupt database degrades softly: warn once at boot, then resolve every IP to `null`.
- `SimulatedResolver`: dev and test only, driven by an `X-Virly-Dev-Geo` request header of the form `"Paris,FR,48.8566,2.3522"`.
  This makes localhost demoable and E2E fraud tests deterministic.
  `config.ts` throws at boot if simulation is enabled in production, matching the existing fail-fast culture.
- `VIRLY_GEO_ENABLED=false` is the master kill switch and gates capture itself, not just resolution: no resolver is installed and no events are written at all.

IP extraction uses Express `req.ip` with trust-proxy configured; private and unresolvable IPs yield `geo: null`.

## Capture

Two server-side choke points:

- The auth service, on successful login.
- The transfer service, at execution, which covers both UI transfers and AI-confirmed transfers because both flow through the same service.

Capture is strictly non-blocking: a failed event write logs loudly but never fails a login or a transfer.

## Fraud rules (phase 2)

`computeRisk` stays pure.
The fraud service precomputes three primitive geo signals from the user's recent located events, the same way it already precomputes `recentDebitAmounts`:

| Signal | Rule | Weight | Reason style |
|---|---|---|---|
| `travelSpeedKmh` | > 900 km/h since the previous located event | +0.45 | "This transfer originates ~2,900 km from your activity 40 minutes ago." |
| `isNewCountry` | country not seen in the trailing 90 days | +0.25 | "First activity from France." |
| `distanceFromHomeKm` | > 500 km from the learned home | +0.10 | "Far from your usual area." |

- "Home" is the centroid of the user's most frequent recent city cluster, learned from history, never parsed from the free-form `PersonalDetails.address`.
  Home is undefined until the user has at least 5 located events; below that the far-from-home rule cannot fire.
- Fail-open everywhere: null geo contributes nothing; an empty history means new-country cannot fire, so fresh accounts are not flagged; impossible travel needs only two located events, so it becomes useful earliest.
- `computeRisk` maps score >= 0.7 to `high` and >= 0.4 to `medium`.
  The weights are calibrated against those existing thresholds: impossible travel plus new country (0.45 + 0.25 = 0.70) reaches `high` on its own, so the existing email-confirmation hold triggers with zero new machinery; impossible travel alone is `medium`.
  Geo reasons flow into existing risk-reason surfaces automatically.
- Pure helpers (`haversineKm`, `homeBaseline`, `travelSpeed`) live in `server/src/fraud/geo.ts` with deterministic unit tests in the style of the current `risk.ts` suite.

## Activity view and realtime alert (phase 3)

- New endpoint: `GET /api/users/me/activity`, user-scoped, read-only, cursor-paginated (`before` + `limit`).
- New "Security" area in `client/src/features/settings/`: a recent-activity list (kind, city, relative time, a marker on events that contributed risk reasons) alongside a map of the same events.
- Map library: `react-leaflet` v5 (built for React 19) with OSM raster tiles and attribution, loaded as a lazy route chunk.
- Client harness constraint: tests render via `renderToStaticMarkup` with no jsdom, and Leaflet needs a real DOM.
  The map is therefore an isolated leaf component that renders a placeholder when `window` is absent; the list and data plumbing live in separately testable components; the map gets a Storybook story instead of a markup test.
- Realtime: when a login event lands with a new-country or impossible-travel signal, the server emits a Socket.IO event to the user's other active sessions and the client shows a "New login from Paris, France" toast.
  `computeRisk` is transfer-scoped, so login events are evaluated at capture time with the same pure helpers from `fraud/geo.ts`; there is no separate login scorer.
  No polling.

## AI tools (phase 4)

- v2 assistant: a read-only `getRecentActivity` tool returning located events, joinable to transactions via `transactionId`, following the existing pattern in `server/src/ai/v2/tools/`.
  Enables "any logins from unusual places?" and "where was I when I sent that transfer?".
- Support MCP server: a matching customer-scoped read tool alongside `list_fraud_flags`.
- New eval cases plus `aiSafety` suite entries pin the tools as read-only; location must never become an input that moves money.

## Error handling summary

- Missing or corrupt mmdb: warn once, resolver yields null, feature degrades gracefully (the RAG-unavailable precedent).
- Lookup exceptions: caught, yield null, never block the request.
- Private or localhost IPs: event recorded with `geo: null`.
- Event write failure: logged loudly, login/transfer proceeds.
- Simulation enabled in production: `config.ts` throws at boot.

## Testing

- Pure geo functions: deterministic unit tests.
- `ActivityEvent` repositories: contract suite cases against both real databases.
- Fraud service: integration tests using the simulated resolver.
- Flagship E2E: log in "from Tel Aviv", transfer "from Paris" 30 minutes later via the dev geo header, assert the risk level and the email-hold path.
- Client: list and data-hook tests; Storybook story for the map.
- AI: eval cases and safety-suite entries for the new tools.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `VIRLY_GEO_ENABLED` | `true` | Master switch; when false nothing is captured. |
| `VIRLY_GEOIP_DB_PATH` | unset | Path to `GeoLite2-City.mmdb`; unset means lookups resolve to null. |
| `VIRLY_MAXMIND_LICENSE_KEY` | unset | Used only by `npm run geo:sync`. |
| `VIRLY_GEOIP_SIMULATION` | `false` | Enables the dev header resolver; boot fails if enabled in production. |
| `VIRLY_ACTIVITY_RETENTION_DAYS` | `180` | TTL for activity events. |

All variables resolve through `server/src/config.ts` with the usual unprefixed aliases.

## Phasing

Each phase is independently shippable:

1. Event stream, resolver, capture, retention, contract tests (invisible, but the seam work lands here).
2. Geo signals in `computeRisk` plus service wiring (user-visible in risk reasons and holds).
3. Activity API, settings Security section, realtime login alert.
4. AI assistant tool, MCP support tool, evals.

## Privacy and retention

- Stored per event: IP, coarse city-level location, timestamp, kind.
- Nothing is shared across users; every read path is scoped to the authenticated user (or the customer-scoped MCP tools).
- Events expire after the retention window in both drivers.
- Capture is always-on by design; the transparency mechanism is the user-facing Security view, not an opt-out.

## Future extensions (explicitly out of scope)

- Native geospatial queries (PostGIS, 2dsphere) behind the same repository interface, if a cross-user signal ever appears.
- Fraud-ring detection: many accounts acting from the same unusual location.
- Travel notices: user-declared trips that relax geo rules for a window and region.
- Browser-geolocation enrichment for map precision, if a consent story is designed.
