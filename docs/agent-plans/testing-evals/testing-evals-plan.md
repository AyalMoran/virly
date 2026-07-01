# Plan: Testing & Evals Guide

> **Deliverable:** `docs/testing.md`
> **Type:** Onboarding / reference
> **Audience:** Contributors running or adding tests and AI evals
> **Status:** Done - shipped as `docs/testing.md`.
> **Gap:** Table 2 #8 — unit vs contract (real-DB) tests and the LangSmith evals are undocumented from the docs tree.

## Why this doc
The repo has three test tiers (unit, real-DB contract, AI evals) with different
runners, prerequisites, and dependencies (docker for contract; OpenAI/LangSmith
for evals). New contributors don't know what to run, when, or what each needs.

## Source material (already in the repo)
- Scripts: root `package.json` (`test:client`, `test:server`), `server/package.json` (`test`, `test:contract`, `db:generate`, `db:migrate`)
- Unit tests: `server/src/**/*.test.ts`, `client/tests/**/*.test.tsx`
- Contract tests (real DBs): `server/tests/contract/*.contract.test.ts` (run via `test:contract`, `--test-concurrency=1`)
- Test infra: `docker-compose.test.yml`
- Seam guard: `server/src/repositories/no-direct-model-imports.test.ts`
- Evals: `server/src/ai/evals/` (v1), `ai/evals/v2/README.md`, `ai/evals/langsmith/README.md` + `run-experiment.ts`, `sync-dataset.ts`

## Phases
### Phase 1 — Tier map
- [x] One table: tier · command · prerequisites · what it proves · when to run (PR vs nightly vs pre-release).
- **Deliverable:** `docs/testing.md` skeleton + tier table.

### Phase 2 — Unit + client
- [x] Document `npm run test:server` / `test:client`, the `tsx --test` runner, and the conventions (mocks at the repository interface, no live DB).
- [x] Note the `no-direct-model-imports` guard as a build-failing architectural test.
- **Deliverable:** "unit tests" section.

### Phase 3 — Contract (real DB) tier
- [x] Document `docker-compose.test.yml` bring-up, `db:generate`/`db:migrate`, then `npm run test:contract` against both Mongo and Postgres; explain it is the proof of driver parity.
- **Deliverable:** "contract tests" section with copy-paste commands.

### Phase 4 — AI evals
- [x] Link and summarize the existing eval READMEs (v1, v2, LangSmith); document required env (OpenAI key, LangSmith) and how to run an experiment/sync a dataset.
- [x] Do **not** duplicate the eval READMEs — link them and add only the "how to get started" glue.
- **Deliverable:** "AI evals" section.

## Acceptance criteria
- [x] Every command in the doc runs as written from a clean checkout (with stated prerequisites).
- [x] The contract-test docker prerequisite is explicit.
- [x] Eval sections link the source READMEs rather than copying them.

## Related docs (link, don't duplicate)
[operations-runbook](../operations-runbook/operations-runbook-plan.md) · [ai-architecture](../ai-architecture/ai-architecture-plan.md) · `server/src/ai/evals/**/README.md`

## Effort estimate
Medium (M).
