# Plan: Configuration / Environment Reference

> **Deliverable:** `docs/configuration.md`
> **Type:** Reference
> **Audience:** Anyone running, deploying, or onboarding to the app
> **Status:** Complete
> **Gap:** Table 2 #4 — env vars are scattered across README, `.env.example`, and the migration spec §10.

## Why this doc
There is no single, authoritative list of every environment variable, its
default, whether it's required, and what fails if it's missing. `config.ts`
fails fast on several — that contract should be documented in one place.

## Source material (already in the repo)
- `server/src/config.ts` (fail-fast validation: JWT secret, `VIRLY_POSTGRES_URL` when driver is postgres)
- `server/src/utils/env.ts` (`getStringEnv` and friends)
- `.env.example` (repo root)
- Root `README.md` "Getting Started"
- `docs/superpowers/specs/2026-06-22-postgres-migration-design.md` §10 (DB vars)
- Consumers: `services/email.service.ts` (Resend / `VIRLY_EMAIL_FROM`), `ai/llm.ts` + `ai/v2/model.ts` (OpenAI), `services/jitsiProvider.service.ts` (Jitsi)

## Phases
### Phase 1 — Extract every variable
- [x] Grep `process.env` and `getStringEnv`/`getEnv` across `server/src` to enumerate all variables actually read.
- [x] Cross-check against `.env.example`; flag any var read in code but missing from the example (and vice-versa).
- **Deliverable:** a raw list with file:line for each var.

### Phase 2 — Write the reference table
- [x] One table: **Variable · Required? · Default · Used by · Fails how if missing**. Group by concern: Database, Auth/JWT, Email, AI/OpenAI, Video/Jitsi, Server/runtime.
- [x] Note fail-fast behaviours explicitly (which vars throw at boot).
- **Deliverable:** `docs/configuration.md` reference table.

### Phase 3 — Profiles + reconcile `.env.example`
- [x] Document the common profiles: local dev (Mongo default), Postgres mode (`VIRLY_DB_DRIVER=postgres` + `VIRLY_POSTGRES_URL`), and test (what `docker-compose.test.yml` sets).
- [x] Update `.env.example` so it lists every required var with safe placeholders (fixing any gap from Phase 1).
- **Deliverable:** profiles section + an accurate `.env.example`.

## Acceptance criteria
- [x] Every `process.env.*` read in `server/src` appears in the table.
- [x] Required-vs-optional and defaults match `config.ts`/`utils/env.ts` exactly.
- [x] `.env.example` contains every required variable.

## Related docs (link, don't duplicate)
[operations-runbook](../operations-runbook/operations-runbook-plan.md) · [security-model](../security-model/security-model-plan.md) · `README.md`

## Effort estimate
Small–Medium (S–M) — bounded; the work is enumeration + verification.
