# Documentation Plans - index

Phased plans for the ten documentation gaps identified in the 2026-06-25 docs
audit (Table 2).
Each plan lives in its own subdirectory and is self-contained:
deliverable, audience, source material already in the repo, phases with
deliverables, acceptance criteria, and an effort estimate.

**Status: all ten plans are delivered.**
Every plan below shipped its deliverable into `docs/`; the table links each plan to the doc it produced.
The plans are retained as the build record - read the linked deliverable for current content, and the plan for how it was scoped.

| # | Plan | Deliverable (shipped) | Type | Effort | Status |
|---|------|-------------|------|--------|--------|
| 1 | [Backend / Server reference](backend-reference/backend-reference-plan.md) | [`docs/backend/`](../backend/index.md) | Module reference | L | Done |
| 2 | [AI assistant architecture (v1+v2)](ai-architecture/ai-architecture-plan.md) | [`docs/ai/architecture.md`](../ai/architecture.md) | Architecture | L | Done |
| 3 | [API reference (surface `openapi.yaml`)](api-reference/api-reference-plan.md) | [`docs/api/README.md`](../api/README.md) | API docs | M | Done |
| 4 | [Configuration / environment reference](configuration-reference/configuration-reference-plan.md) | [`docs/configuration.md`](../configuration.md) | Reference | S-M | Done |
| 5 | [Postgres migration Phase 2 spec](postgres-phase2-spec/postgres-phase2-spec-plan.md) | [`...-phase2-design.md`](../superpowers/specs/2026-06-25-postgres-migration-phase2-design.md) | Design spec | M | Done |
| 6 | [Transfers / money-movement domain](transfers-domain/transfers-domain-plan.md) | [`docs/domain/transfers.md`](../domain/transfers.md) | Domain doc | M | Done |
| 7 | [Security model](security-model/security-model-plan.md) | [`docs/security.md`](../security.md) | Architecture | M | Done |
| 8 | [Testing & evals guide](testing-evals/testing-evals-plan.md) | [`docs/testing.md`](../testing.md) | Onboarding | M | Done |
| 9 | [Operations / deploy runbook](operations-runbook/operations-runbook-plan.md) | [`docs/operations.md`](../operations.md) | Runbook | M | Done |
| 10 | [ADR index](adr-index/adr-index-plan.md) | [`docs/adr/`](../adr/README.md) | Decision log | M | Done |

## Build order (historical)

The plans were sequenced in this order because they link to each other ("link, don't duplicate"):

1. **API reference (#3)** and **Configuration (#4)** first - small, self-contained, and the things every other doc links to.
2. **Security (#7)**, **Transfers domain (#6)**, **Testing & evals (#8)**, **Operations (#9)** next - each depends mainly on #3/#4 plus code already in the repo.
3. **AI architecture (#2)** - depends on the Transfers domain doc for the HITL gate.
4. **Backend reference (#1)** - broadest; sequenced last so it links the API, AI, and domain docs instead of re-describing them.
5. **ADR index (#10)** - scaffolded early (seeded from the Postgres spec), finished alongside #1 so the backend reference can link decisions.
6. **Postgres Phase 2 spec (#5)** - independent; written as the Phase 1 handoff.

## Conventions for executing these plans
- Apply the documentation principles: write for the reader, lead with the most useful info, show with examples/commands, **link don't duplicate**, keep it current.
- Verify every cited path and endpoint against the code before publishing (the audit that produced these plans found that the previous docs drifted once the code moved - see `docs/improvements/` and `docs/superpowers/`).
- `docs/` is git-tracked (only transient run-logs are ignored - see `.gitignore`), so these docs ship with the repo.
