# ADR-0004: Repository-interface data-access seam

**Status:** Accepted
**Date:** 2026-06-22
**Source:** [`docs/planning/specs/2026-06-22-postgres-migration-design.md`](../planning/specs/2026-06-22-postgres-migration-design.md) — "Locked decisions" table, row "Seam shape"; §1 "Architecture"; §2 "Repository interfaces + domain records". Enforcement: `server/src/repositories/no-direct-model-imports.test.ts`. See also [`../backend/index.md`](../backend/index.md) — "The `no-direct-model-imports` guard" section.

---

## Context

Before the Postgres migration, services and AI tools imported Mongoose models
directly. That coupling made it impossible to swap the database driver without
touching ~40 files. The migration needed a seam that both drivers could satisfy
without any change to the consumers, and that could be verified mechanically so
future changes don't re-introduce the coupling.

## Decision

A typed repository interface (`server/src/repositories/types.ts`) sits between
the service/tool layer and the database. All services and AI tools depend only
on that interface. Two implementations — `repositories/mongo/` (Mongoose-backed)
and `repositories/postgres/` (Drizzle-backed) — satisfy the interface. A
`createRepositories(driver)` factory (called once at boot) produces the correct
implementation. Repositories return plain domain records (POJOs with `id:
string`), never Mongoose Documents or Drizzle row objects. The constraint is
enforced by `no-direct-model-imports.test.ts`, which fails if any file outside
`repositories/mongo/` and `ai/evals/` imports from `models/*`.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Service-layer adapter (services hold `if (driver === "mongo")` branches) | Pushes driver logic into business logic; each new driver requires touching every service; harder to test in isolation. |
| DTO mappers at the route layer | Services still couple to driver-specific objects; transactional invariants are harder to maintain. |
| ORM abstraction (e.g. TypeORM entity sharing) | Requires both drivers to share an ORM, ruling out Mongoose + Drizzle independently; adds runtime magic the codebase deliberately avoids. |

## Status

Accepted — `server/src/repositories/types.ts`, `registry.ts`, and the `mongo/`
and `postgres/` implementation trees are live. The guard test
(`no-direct-model-imports.test.ts`) is part of the CI suite.

## Consequences

**Positive:** Application code is fully driver-agnostic; switching drivers is a
one-line env change; the repository contract suite (run against both real
databases) is the proof of behavioural equivalence; future drivers require only
a new implementation, not consumer changes.

**Negative / trade-offs:** The initial migration required a broad but mechanical
refactor of ~40 consumer files. Every new entity requires writing both a Mongo
and a Postgres implementation to maintain parity.

**Neutral / follow-on work:** The `TxContext` opaque handle (see spec §3)
provides the same atomicity guarantee on both drivers without exposing
driver-specific transaction APIs to consumers.
