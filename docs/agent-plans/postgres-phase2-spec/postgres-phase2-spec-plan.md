# Plan: Postgres Migration — Phase 2 Design Spec

> **Deliverable:** `docs/superpowers/specs/<date>-postgres-migration-phase2-design.md`
> **Type:** Design spec (matches the Phase 1 spec format)
> **Audience:** The agent/engineer who will implement Phase 2
> **Status:** Done - spec shipped at `docs/superpowers/specs/2026-06-25-postgres-migration-phase2-design.md` (Draft - ready for implementation planning).
> **Gap:** Table 2 #5 — Phase 1 repeatedly references a "separate Phase 2 spec" that does not exist.

## Why this doc
Phase 1 deliberately left LangGraph persistence on Mongo (design spec §6, §13).
The repo still opens a Mongoose connection in Postgres mode *only* for the v2
checkpointer/store. Phase 2 removes that last Mongo dependency. There is no
written design for it yet.

## Source material (already in the repo)
- Phase 1 spec §6 (LangGraph hybrid) and §13 (out of scope) — the explicit handoff
- Current Mongo-backed memory: `server/src/ai/v2/memory/checkpointer.ts` + `store.ts` (both use `@langchain/langgraph-checkpoint-mongodb`: `MongoDBSaver`, `MongoDBStore`)
- Memory glue: `ai/v2/memory/{summary,loop,types}.ts`
- Boot: `server/src/db.ts` (always connects Mongo today), `config.ts`
- Target library: `@langchain/langgraph-checkpoint-postgres` (not yet a dependency)

## Phases
### Phase 1 — Scope & constraints (mirror the Phase 1 spec)
- [x] Write the **Goal / Definition of done**: v2 memory runs on Postgres; with `VIRLY_DB_DRIVER=postgres` the app no longer requires a Mongo connection; reversibility preserved.
- [x] Record **locked decisions** (checkpointer/store library, thread-id mapping, JSON serialization parity).
- **Deliverable:** spec header + goal + locked-decisions table.

### Phase 2 — Design the swap
- [x] Document replacing `MongoDBSaver`/`MongoDBStore` with the Postgres checkpoint/store, behind the same memory interface in `ai/v2/memory/`.
- [x] Schema/migration plan for the LangGraph tables (Drizzle migrations vs the library's own migrator).
- [x] Boot changes: make the Mongoose connection conditional (only in Mongo mode).
- **Deliverable:** architecture + schema sections.

### Phase 3 — Data migration + reversibility
- [x] Plan to migrate existing threads/long-term memory (or define an acceptable "fresh start" with rationale).
- [x] Reverse path back to Mongo, consistent with Phase 1's flip-the-flag model.
- **Deliverable:** cutover/rollback runbook section.

### Phase 4 — Testing & risks
- [x] Extend the contract suite to cover memory parity if feasible; define eval regression checks (the v2 evals still pass).
- [x] Risk table (serialization drift, summarization loop behaviour, checkpoint compatibility).
- **Deliverable:** testing + risks sections; spec marked "ready for implementation planning".

## Acceptance criteria
- [x] The spec follows the Phase 1 spec's section structure so the two read as a series.
- [x] After Phase 2 ships, no `@langchain/langgraph-checkpoint-mongodb` import remains and Postgres mode needs no Mongo.
- [x] Reversibility is preserved end-to-end.

## Related docs (link, don't duplicate)
[ai-architecture](../ai-architecture/ai-architecture-plan.md) · `docs/superpowers/specs/2026-06-22-postgres-migration-design.md` · `docs/superpowers/plans/2026-06-23-postgres-migration-driver.md`

## Effort estimate
Medium (M) for the spec itself; implementation is a separate, larger effort.
