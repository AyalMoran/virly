# Virly Todoist → Implementation-Plan Index

Audit of every task in the **Virly** Todoist project (id `6h24mGHhRhH7FQ4c`), mapping each to its implementation plan and status.
This is the roadmap for the "create an implementation plan for each task" effort: it records which tasks already have plans, which are already delivered, and which still need one, so plan-writing never duplicates work.

Snapshot date: **2026-07-01**. Regenerate the "Status" column from Todoist + `git log` when it drifts.

## Legend

- **Delivered** - shipped in code; a plan may exist as a record.
- **Planned** - an implementation plan exists in `plans/`; ready to execute.
- **Needs plan (ready)** - well-specified enough to write a plan directly.
- **Needs plan (design first)** - underspecified; run `superpowers:brainstorming` to produce a spec before a plan.
- **Non-code** - a personal/study/meta task with no code deliverable; no implementation plan expected.

## AI assistant (section `ai`, `6h2Vr9qcR72vV4H6`)

| Todoist ID | Task | Plan | Status |
|---|---|---|---|
| `6h2V5c3Ch7Rv9W86` | Add a per-user persona config | `plans/2026-07-01-per-user-communication-profile.md` | **Delivered** (PR #30, commit b60e6f5) |
| `6h25Jf6p4jfmqF66` | Set up scheduled idempotent RAG sync (no `--force`) | `plans/2026-06-30-rag-sync-scheduling.md` | **Planned** |
| `6h24RpJcM2XCJH2M` | Make users clickable with hover balloon / user card | `plans/2026-06-26-user-hover-card.md` | **Planned** |
| `6h24jj9pcF5FRVw3` | Author `policy-rag.examples.jsonl` for RAG recall eval | `plans/2026-07-01-policy-rag-eval-dataset.md` | **Planned** (this run) |
| `6h249JvMvfXqrqvM` | "All transactions from a counterparty" returns only 3, not all | - | Needs plan (ready) - bug; likely a hard tool result cap |
| `6h249Qj89VXWqGJv` | Emails masked only for the LLM, not for the user | - | Needs plan (design first) - masking is an intentional PII seam woven through the tool layer |
| `6h249mpF4hMf9GFM` | Nicer summary card for counterparty summary (bento) | - | Needs plan (ready) - UI, `responseBlocks` + client card |
| `6h24Rj94qFXr7jHM` | SSE stream in Hebrew/English matching user language/persona | - | Needs plan (design first) - overlaps the language-switcher task |
| `6h24RprvGp9m692v` | Add retry / stream arrival guarantee | - | Needs plan (design first) - also in `backlog.md` |
| `6h2W38WrRpHRhvWc` | Chat features: new chat, edit-and-resend, resend message | - | Needs plan (ready) - three sub-features, split into a plan each |
| `6h2RwXw22Gpj2CC6` | Move to TOON format instead of JSON | - | Needs plan (design first) - first verify TOON is a supported structured-output format + measure token delta |

## Feature (section `feature`, `6h2Vr4wM3GqVvv86`)

| Todoist ID | Task | Plan | Status |
|---|---|---|---|
| `6gwM3WVJXHcX57Fv` | Add language switcher (Hebrew/English, whole site) | - | Needs plan (design first) - task itself asks to brainstorm scope (exclude heavy placeholder components?) |
| `6gfGpV4GVwGxhjPM` | Add contacts and "recent" (להוסיף אנשי קשר ו-recent) | - | Needs plan (ready) - recipients list on transfer/dashboard |
| `6gfGpmqghHHR55qM` | Add an option to request funds | - | Needs plan (design first) - new transfer direction; touches money-movement + HITL |

## Study (section `study`, `6h2Vr7Qq6X5Q372c`)

| Todoist ID | Task | Plan | Status |
|---|---|---|---|
| `6h2GwjjChx2vrxFc` | Presentation doc per module (server, client, DB, AI, MCP, RAG) | - | Needs plan (ready) - doc deliverable; much source already in `docs/backend/areas` + `docs/ai` |
| `6gwM3Rj9whXjPPVv` | Go over all DOCS and TODO (לעבור על כל ה-DOCS וה-TODO) | - | Non-code (meta review task) |
| `6gmpxVhcFCF85W9v` | Practice presenting solo on a board (להציג מצגת לבד על לוח) | - | Non-code (personal rehearsal) |

## Server (section `server`, `6h2VrQ98cWpQpFMc`)

| Todoist ID | Task | Plan | Status |
|---|---|---|---|
| `6h2Rpwm7rQG9XH76` | Startup throttle seems to affect every API call (pages take seconds) | - | Needs plan (ready) - perf bug; reproduce, find the throttle/middleware, fix |

## CI/CD (section `cicd`, `6gfGmxrWJ67CPMfv`)

| Todoist ID | Task | Plan | Status |
|---|---|---|---|
| `6h2HPVWRG3cR79Vc` | Add more CI checks; clarify what "playground" is and how to wire it | - | Needs plan (ready) - see memory: playground is a local advisory hook, not a CI job |

## Rollup

- 19 tasks total: **1 delivered**, **3 planned** (1 authored this run), **~13 need a plan**, **2 non-code**.
- Suggested plan order for "ready" tasks (small, high-signal first): transactions-cap bug (`6h249JvMvfXqrqvM`) → counterparty summary card (`6h249mpF4hMf9GFM`) → contacts/recent (`6gfGpV4GVwGxhjPM`) → chat features (`6h2W38WrRpHRhvWc`, split) → startup throttle (`6h2Rpwm7rQG9XH76`) → CI checks (`6h2HPVWRG3cR79Vc`) → presentation docs (`6h2GwjjChx2vrxFc`).
- "Design first" tasks (email masking, TOON, SSE language, retry guarantee, language switcher, request funds) should each get a `superpowers:brainstorming` spec in `specs/` before a plan.

## Suggestions (draft - not yet in Todoist)

Candidates for a Todoist **suggestions** section, to be added once grounded across more of the codebase:

- **Gate the policy-RAG recall eval in CI** once `policy-rag.examples.jsonl` exists and a test knowledge base is available (depends on `6h24jj9pcF5FRVw3`).
- **Sync `docs/planning/backlog.md` items into Todoist** - the backlog lists work not tracked as tasks (e.g. "Consolidate hitl.ts and graph.ts", "improve persona prompts", "dad-jokes storage per intent").
- **Audit AI tool-result row caps** - the "only 3 transactions" bug (`6h249JvMvfXqrqvM`) hints at a shared truncation limit; one task to review every tool's list cap and how totals are surfaced to the LLM vs. the user.
