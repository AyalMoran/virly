# ADR-0014: Self-managed AI-Postgres tables via CREATE TABLE IF NOT EXISTS

**Status:** Accepted
**Date:** 2026-06-27
**Source:** `server/src/fraud/holds.ts` (`setupHoldsTable`, lines 73–99, `CREATE TABLE IF NOT EXISTS held_transfers`); `server/src/fraud/service.ts` (`setupFlagsTable`, lines 74–93, `CREATE TABLE IF NOT EXISTS ai_fraud_flags`); `server/src/ai/v2/memory/postgresStore.ts` (`PostgresLongTermStore.setup`, lines 107–124, `CREATE TABLE IF NOT EXISTS ai_memory_store`).

---

## Context

The AI Postgres (ADR-0009) already has a formal Drizzle migration pipeline
(`drizzle-ai/`, tracked in `__drizzle_migrations_ai`) for the RAG vector schema.
However, several auxiliary tables — `held_transfers`, `ai_fraud_flags`, and
`ai_memory_store` — are owned by runtime components that need to be available
immediately at first use, without requiring an operator to run a migration step.
These tables belong to the AI Postgres tier (not the app's OLTP tier) and share
its connection, but they are operationally owned by specific modules rather than
by the schema-as-a-whole.

## Decision

`held_transfers`, `ai_fraud_flags`, and `ai_memory_store` are created at
runtime via `CREATE TABLE IF NOT EXISTS` (plus `CREATE INDEX IF NOT EXISTS`)
executed by the owning module before its first read or write. Each table has a
module-local `didSetup` guard so the DDL runs at most once per process. The
calls are:

- `setupHoldsTable()` in `holds.ts` — called lazily on first hold create/read,
  and eagerly on `listHeldTransfers`.
- `setupFlagsTable()` in `service.ts` — called lazily before inserting a flag,
  and eagerly on `listFraudFlags`.
- `PostgresLongTermStore.setup()` in `postgresStore.ts` — called at boot when
  `VIRLY_AI_MEMORY_BACKEND=postgres` (via `setupAiMemoryBackend()`), and
  defensively before every `batch()` operation.

These tables do NOT appear in `drizzle-ai/` migrations because adding them there
would require operators to rerun migrations whenever a table is added or a
feature is enabled — a friction point for a table that is already safe to create
idempotently at runtime.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Add to the `drizzle-ai/` Drizzle migration pipeline | Requires `npm run rag:migrate` every time a new auxiliary table is added; the module-local setup approach is simpler and already idempotent. |
| Add to the app's main Drizzle migration pipeline | These tables are AI-store concerns; mixing them into the app's migration history violates the independence described in ADR-0009. |
| Create tables on a separate one-off bootstrap command | Increases operational surface area; `CREATE TABLE IF NOT EXISTS` at first use is safe and eliminates the "forgot to run bootstrap" failure mode. |

## Status

Accepted — `setupHoldsTable`, `setupFlagsTable`, and `PostgresLongTermStore.setup`
are live. All three use the `getAiDb()` singleton from `server/src/db/vector.ts`.

## Consequences

**Positive:** No migration step is needed to enable the fraud hold flow or
fraud-flag persistence; tables appear automatically on first use; idempotency
means multiple restarts or concurrent boot paths are safe.

**Negative / trade-offs:** Table schemas are defined in SQL strings inside
application code rather than in version-controlled migration files, so schema
drift is not automatically detectable by the migration toolchain. Column
additions require manual `ALTER TABLE` or a module-code update alongside a
migration; there is no built-in rollback path.

**Neutral / follow-on work:** If these tables grow complex (foreign keys,
multiple indices, schema evolution), migrating them into the `drizzle-ai/`
pipeline with a proper migration file would be the right step. See ADR-0009 for
the AI Postgres connection design, ADR-0012 for the `held_transfers` business
logic, and ADR-0011 for the `ai_fraud_flags` usage.
