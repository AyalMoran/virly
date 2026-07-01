# ADR-0002: 24-hex ObjectId string PKs in both DB drivers

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/planning/specs/2026-06-22-postgres-migration-design.md`](../planning/specs/2026-06-22-postgres-migration-design.md) — "Locked decisions" table, row "Primary keys"; §4 "PostgreSQL schema mapping"

---

## Context

MongoDB auto-assigns 24-hex ObjectId `_id` values. All existing DTOs, API
responses, routing regexes (`^[0-9a-fA-F]{24}$`), AI-tool id parameters, and
client assumptions depend on that format. When adding a PostgreSQL backend, the
choice was to adopt native Postgres serial/UUID PKs or to preserve the 24-hex
format across both drivers.

## Decision

Both drivers use 24-hex ObjectId strings as primary keys. In the Drizzle
schema every table defines `id char(24)` as PK (verified in
`server/src/repositories/postgres/schema.ts`, e.g. `char("id", { length: 24 }).primaryKey()`).
In the Postgres repositories, new ids are generated with
`new mongoose.Types.ObjectId().toString()` (no live DB connection required;
`mongoose` is already a dependency). Foreign keys are likewise `char(24)`.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| UUID v4 PKs on Postgres | Would break DTOs, routing regexes, client assumptions, and make reverse sync non-trivial (id format mismatch between stores). |
| Postgres `SERIAL` / `BIGSERIAL` integer PKs | Same problems as UUID plus the id type contract changes from string to number across the entire API. |

## Status

Accepted — the Drizzle schema (`server/src/repositories/postgres/schema.ts`)
uses `char(24)` for every PK and FK column. The format is identical to what
Mongoose generates.

## Consequences

**Positive:** Zero change to DTOs, API contracts, routing guards, client code,
or AI tool parameters. Reverse sync is trivially keyed on the same `id` value.

**Negative / trade-offs:** Postgres `char(24)` is slightly less space-efficient
than a native UUID (16 bytes) or bigint (8 bytes). The `mongoose` package must
remain a runtime dependency even in Postgres mode solely for id generation.

**Neutral / follow-on work:** None. The format is fixed for the lifetime of
Phase 1.
