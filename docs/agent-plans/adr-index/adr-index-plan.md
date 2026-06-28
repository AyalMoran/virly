# Plan: Architecture Decision Records (ADR) Index

> **Deliverable:** `docs/adr/` (a `README.md` index + a `0000-template.md` + seeded ADRs)
> **Type:** Decision log
> **Audience:** Future contributors asking "why is it built this way?"
> **Status:** Not started
> **Gap:** Table 2 #10 — no `docs/adr/` exists; key decisions live only inside the Postgres design spec.

## Why this doc
Several load-bearing decisions are recorded only as prose inside one spec or
nowhere at all. An ADR log captures each decision, its context, and its
trade-offs in a stable, linkable place — and gives future decisions a home.

## Source material (already in the repo)
- Postgres design spec "Locked decisions" table (the richest seam): boot-time single-DB (no dual-write), 24-hex ObjectId strings in both drivers, `double precision` not `numeric`, Drizzle ORM, repository-interfaces seam, enums-as-`text`+CHECK
- `docs/improvements/*` (the services/repository convention)
- Implicit decisions worth recording: HttpOnly-JWT-cookie + CSRF auth, the AI HITL money-movement gate, the persona layer, v1-vs-v2 assistant split

## Phases
### Phase 1 — Scaffold
- [x] Create `docs/adr/README.md` (what an ADR is, the numbering + status convention) and `docs/adr/0000-template.md` (MADR-style: Context, Decision, Status, Consequences, Alternatives).
- **Deliverable:** ADR directory + template + index skeleton.

### Phase 2 — Seed from the Postgres spec
- [x] Write one ADR per locked decision in the migration spec, citing the spec as the source. Suggested first batch:
  - ADR: Reversible single-live-DB via boot-time flag (no dual-write)
  - ADR: 24-hex ObjectId string PKs in both drivers
  - ADR: `double precision` for money (parity over `numeric` hardening)
  - ADR: Repository-interface data-access seam
- **Deliverable:** 4 seeded ADRs marked "Accepted".

### Phase 3 — Seed cross-cutting decisions
- [x] ADRs for: HttpOnly-JWT-cookie + CSRF auth; AI HITL confirmation gate before money movement; persona layer; v1/v2 assistant coexistence.
- **Deliverable:** 4 more ADRs.

### Phase 4 — Wire it in
- [x] Link `docs/adr/` from the root `README.md` and the backend reference.
- [x] Add a one-line "how to add an ADR" note so the log keeps growing.
- **Deliverable:** index complete + linked.

## Acceptance criteria
- [x] Each seeded ADR states Context, Decision, Status, and Consequences and cites its source.
- [x] The index lists every ADR with its status.
- [x] No ADR invents a decision the code/spec doesn't actually reflect.

## Related docs (link, don't duplicate)
[backend-reference](../backend-reference/backend-reference-plan.md) · `docs/superpowers/specs/2026-06-22-postgres-migration-design.md` · `docs/improvements/README.md`

## Effort estimate
Medium (M) — scaffolding is quick; value is in writing the seed ADRs accurately.
