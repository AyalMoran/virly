# Plan: Operations / Deploy Runbook

> **Deliverable:** `docs/operations.md`
> **Type:** Runbook
> **Audience:** Whoever runs, deploys, or recovers the app
> **Status:** Done - shipped as `docs/operations.md`.
> **Gap:** Table 2 #9 — docker-compose, the Mongo `rs0` replica-set requirement, the TTL sweeper, and cutover live only inside a spec.

## Why this doc
Operationally critical facts are buried in the Postgres design spec or implicit
in compose files. A runbook surfaces them: how to bring the stack up, why Mongo
must be a replica set, how TTL behaves per driver, and how to cut over / roll
back databases.

## Source material (already in the repo)
- `docker-compose.yml`, `docker-compose.test.yml`, `Dockerfile`, `.dockerignore`
- Boot: `server/src/{index.ts,db.ts}`, `db/postgres.ts`
- Mongo replica set `rs0` requirement (transactions need it) — Postgres spec §3
- TTL sweeper (Postgres mode only): `server/src/ttl/sweeper.ts` — spec §5
- Cutover/rollback: Postgres spec §12; sync/parity scripts `server/scripts/{sync-mongo-to-postgres,sync-postgres-to-mongo,verify-parity}.ts`
- FX refresh interval (`startDailyFxRefresh`) and other boot intervals

## Phases
### Phase 1 — When to use + prerequisites
- [x] Scope the runbook (local + deploy), list access/tooling needed (docker, node, DB URLs), and link the Configuration reference for env vars.
- **Deliverable:** `docs/operations.md` header + prerequisites.

### Phase 2 — Bring-up
- [x] Step-by-step local bring-up via `docker-compose.yml`, including **why Mongo runs as replica set `rs0`** (multi-document transactions) and the health check (`GET /api/health`).
- [x] Production build/run via the `Dockerfile`.
- **Deliverable:** "running the stack" section.

### Phase 3 — Database operations
- [x] Mongo-vs-Postgres mode at boot; the TTL sweeper's role in Postgres mode (Mongo uses native TTL indexes).
- [x] **Cutover runbook** (forward Mongo→Postgres) and **rollback** (Postgres→Mongo) using the sync + `verify-parity` scripts — adapt the spec §12 steps into an operator checklist with verification gates.
- **Deliverable:** "database ops" section with numbered, copy-paste steps and rollback.

### Phase 4 — Recovery + escalation
- [x] Common failure modes (DB unreachable, missing required env → fail-fast at boot, FX provider down) and their first-response.
- [x] Escalation path placeholder.
- **Deliverable:** "troubleshooting & escalation" section.

## Acceptance criteria
- [x] Bring-up steps work from a clean checkout.
- [x] The `rs0` replica-set requirement is stated with its reason.
- [x] Cutover and rollback are each a numbered procedure with a verification gate (`verify-parity` must be zero-mismatch before flipping the flag).

## Related docs (link, don't duplicate)
[configuration-reference](../configuration-reference/configuration-reference-plan.md) · [testing-evals](../testing-evals/testing-evals-plan.md) · `docs/superpowers/specs/2026-06-22-postgres-migration-design.md` §12

## Effort estimate
Medium (M).
