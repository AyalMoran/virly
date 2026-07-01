# ADR-0001: Reversible single-live-DB via boot-time flag

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/planning/specs/2026-06-22-postgres-migration-design.md`](../planning/specs/2026-06-22-postgres-migration-design.md) — "Locked decisions" table, row "Reversibility model"

---

## Context

Virly needed a path from MongoDB to PostgreSQL that carried no data-loss risk
and could be reversed cheaply if PostgreSQL proved problematic in production.
The options were: (a) a dual-write phase where both stores are kept live and
in sync, or (b) a single-live-DB model where exactly one store is active at a
time, selected at boot. See the full migration design for rationale and the
cutover/rollback runbook: [`../planning/specs/2026-06-22-postgres-migration-design.md`](../planning/specs/2026-06-22-postgres-migration-design.md).

## Decision

A single env var, `VIRLY_DB_DRIVER` (`"mongo"` by default, `"postgres"` to
opt-in), selects the live database at boot. Only one store is ever active in a
running process. Reverting means flipping the flag and running the reverse
data-sync script — no application code changes.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Dual-write (both stores live simultaneously) | Adds a write-consistency burden; any divergence between stores creates silent data loss; significantly harder to reason about and test. |
| Big-bang migration (switch once, never roll back) | Eliminates the safety net; if Postgres proves problematic in production there is no cheap escape. |

## Status

Accepted — implemented in Phase 1 (merged to `main`, commit `141be05`). The
`VIRLY_DB_DRIVER` env var, the `createRepositories(driver)` factory, and the
data-sync scripts (`sync-mongo-to-postgres.ts`, `sync-postgres-to-mongo.ts`,
`verify-parity.ts`) are all live under `server/`.

## Consequences

**Positive:** No dual-write complexity; rollback is a flag flip + reverse sync;
the repository seam means application code is identical on both drivers.

**Negative / trade-offs:** A brief maintenance window is required during
cutover to freeze writes while the sync script runs. The Phase-1 hybrid keeps a
Mongo connection open even in postgres mode (LangGraph still uses Mongo — see
ADR-0008 and the spec §6).

**Neutral / follow-on work:** Phase 2 (separate spec) will migrate LangGraph
persistence to Postgres and remove the Mongo connection entirely.
