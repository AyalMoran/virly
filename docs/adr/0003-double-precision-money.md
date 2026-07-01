# ADR-0003: `double precision` for money fields (JS parity over `numeric` hardening)

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/planning/specs/2026-06-22-postgres-migration-design.md`](../planning/specs/2026-06-22-postgres-migration-design.md) — §4 "PostgreSQL schema mapping", money/numeric fields note; "Out of scope" §13

---

## Context

JavaScript's `number` type is IEEE 754 `double precision`. MongoDB stores
numeric values with that same precision. When mapping the schema to PostgreSQL
the choice was between `NUMERIC`/`DECIMAL` (arbitrary precision, no rounding)
and `DOUBLE PRECISION` (IEEE 754, matching JS semantics). Using `NUMERIC` would
avoid floating-point rounding but would introduce silent divergence: the Postgres
driver might return values that differ subtly from what MongoDB stores, breaking
the `verify-parity` checksum comparison and potentially producing different
aggregated totals on the same data depending on which driver is active.

**Verified against schema:** `server/src/repositories/postgres/schema.ts`
uses `doublePrecision(...)` for every money column — `balance` (users),
`amount` and `enteredAmount` and `exchangeRateUsed` (transactions), and `amount`
(ai_pending_transfers). The Drizzle import on line 3 of that file is
`doublePrecision` from `"drizzle-orm/pg-core"`.

## Decision

All money/numeric fields use `double precision` in the Postgres schema, mirroring
JavaScript `Number` semantics exactly. The fields affected are `users.balance`,
`transactions.amount`, `transactions.enteredAmount`,
`transactions.exchangeRateUsed`, and `aiPendingTransfers.amount`.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| `NUMERIC` / `DECIMAL` | Arbitrary precision avoids rounding but diverges from JS `Number` semantics; aggregated totals would differ between Mongo and Postgres modes, breaking parity verification. |
| `BIGINT` with fixed-point (e.g. amount in agorot) | Would require a breaking change to the entire money representation in DTOs and client code; out of scope for Phase 1. |

## Status

Accepted — all money columns in `server/src/repositories/postgres/schema.ts`
are typed as `doublePrecision`. Hardening to `NUMERIC` is explicitly out of
scope for Phase 1 (spec §13) and deferred to a future ADR.

## Consequences

**Positive:** Exact parity with Mongoose/JS number semantics; `verify-parity`
checksums match between drivers; no silent rounding divergence in Phase 1.

**Negative / trade-offs:** Floating-point arithmetic on accumulated balances
carries the standard IEEE 754 imprecision. This is an accepted known limitation
and matches the existing Mongo behaviour.

**Neutral / follow-on work:** Hardening to `NUMERIC` with proper decimal
arithmetic is deferred to Phase 2 / a future ADR, explicitly alongside
`SERIALIZABLE` concurrency tightening (spec §13).
