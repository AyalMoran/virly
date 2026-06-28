# ADR-0010: Swappable AI-memory backend via VIRLY_AI_MEMORY_BACKEND

**Status:** Accepted
**Date:** 2026-06-27
**Source:** `server/src/config.ts` (`resolveAiMemoryBackend`, lines 159–177); `server/src/ai/v2/memory/setup.ts` (`setupAiMemoryBackend`); `server/src/ai/v2/memory/checkpointer.ts` (`getPostgresCheckpointer`, `setupPostgresCheckpointer`, `createCheckpointer`); `server/src/ai/v2/memory/postgresStore.ts` (`PostgresLongTermStore`, `getPostgresLongTermStore`); `server/src/index.ts` (line 12, `setupAiMemoryBackend()` at boot).

---

## Context

The v2 LangGraph agent requires a thread checkpointer (to resume interrupted
transfers and maintain conversation memory across turns) and a long-term store
(for persona-scoped user preferences and summaries). The natural first
implementation backed both on MongoDB — it is already available and Mongo
creates collections lazily. However, the long-term goal (Phase M1.5) is a
single AI Postgres that holds vectors, checkpointer, and long-term store
together, eliminating a second storage tier for AI data. Doing a hard cutover
without a reversible escape hatch is risky during a live system migration.

## Decision

`VIRLY_AI_MEMORY_BACKEND` (`mongo` default | `postgres`) selects where the
LangGraph checkpointer and long-term store live. The flag is parsed by
`resolveAiMemoryBackend()` in `config.ts` with the same "guard against the
string `undefined`" pattern used by `resolveDbDriver()`. It is orthogonal to
`VIRLY_DB_DRIVER`: an operator can run the app against MongoDB while keeping AI
memory on Postgres, or vice versa. Switching backends is a single env flip
followed by a process restart — no data migration is required for forward
progress (the new backend starts fresh).

At boot, `setupAiMemoryBackend()` (`server/src/index.ts` line 12) is a no-op
for the mongo backend (Mongo creates collections on first write) and runs
`setupPostgresCheckpointer()` + `getPostgresLongTermStore().setup()` for
postgres, both of which are idempotent `CREATE TABLE IF NOT EXISTS` calls.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Hard-wire to MongoDB only | Blocks the single-AI-store goal and requires a later, riskier in-place migration. |
| Hard-wire to Postgres only | Breaks existing deployments that do not yet have `VIRLY_AI_PG_URL` configured; removes the zero-dependency local-dev path. |
| Feature-flag per capability (separate flags for checkpointer vs store) | Adds combinatorial complexity; the two are always colocated (both serve the same LangGraph thread), so a single flag is sufficient. |

## Status

Accepted — `config.aiMemoryBackend`, `setupAiMemoryBackend`, `getPostgresCheckpointer`,
and `PostgresLongTermStore` are live. The mongo backend remains the default.

## Consequences

**Positive:** The path to the single-AI-store end-state (all AI data in one
Postgres) is a one-line env change; the Mongo path remains available as a
rollback; `postgres` mode requires no per-user data migration to start.

**Negative / trade-offs:** When `VIRLY_AI_MEMORY_BACKEND=postgres`, conversation
history and persona memory from the previous Mongo backend are not migrated
automatically — threads restart from scratch. Both backends must be maintained
until Mongo is retired.

**Neutral / follow-on work:** Phase M1.5 goal is to flip the default to
`postgres` once the Postgres backend has sufficient production confidence. See
ADR-0009 for the AI Postgres connection strategy and
[`../ai/architecture.md`](../ai/architecture.md) for the full memory layer
design. See also [`../configuration.md`](../configuration.md) for env-var
validation rules.
