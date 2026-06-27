# Architecture Decision Records

An ADR (Architecture Decision Record) captures one load-bearing decision: its
context, what was decided, why, and the trade-offs accepted. Each ADR is
immutable once accepted — if a decision is reversed, a new ADR supersedes the
old one rather than editing it.

## What is an ADR?

An ADR answers the question **"why is it built this way?"** for a future
contributor who wasn't in the room. It is not a design spec (those live in
[`../superpowers/specs/`](../superpowers/specs/)) and it is not a how-to guide.
It is a stable, linkable record of a decision that was made.

## Numbering and status convention

- Files are numbered `NNNN-slug.md`, zero-padded to four digits (e.g.
  `0001-boot-time-db-flag.md`).
- Numbers are assigned sequentially and never reused.
- Every ADR carries one of three statuses:

| Status | Meaning |
|---|---|
| **Proposed** | Under discussion — not yet binding. |
| **Accepted** | Decision is binding and implemented. |
| **Superseded** | Decision has been replaced. The ADR links to its successor. |

## How to add an ADR

Copy [`0000-template.md`](./0000-template.md), give it the next number and a
short slug, fill in Context / Decision / Status / Consequences, and **cite the
spec section or code file** that shows the decision is real. Do not invent
decisions that aren't reflected in the code.

---

## Index

| # | Title | Status |
|---|---|---|
| [0000](./0000-template.md) | Template | — |
| [0001](./0001-boot-time-db-flag.md) | Reversible single-live-DB via boot-time flag | Accepted |
| [0002](./0002-objectid-string-pks.md) | 24-hex ObjectId string PKs in both DB drivers | Accepted |
| [0003](./0003-double-precision-money.md) | `double precision` for money fields (JS parity) | Accepted |
| [0004](./0004-repository-interface-seam.md) | Repository-interface data-access seam | Accepted |
| [0005](./0005-httponly-jwt-cookie-csrf.md) | HttpOnly-JWT-cookie + CSRF double-submit auth | Accepted |
| [0006](./0006-ai-hitl-transfer-gate.md) | AI HITL confirmation gate before money movement | Accepted |
| [0007](./0007-persona-layer.md) | Four-persona layer for the AI assistant | Accepted |
| [0008](./0008-v1-v2-assistant-coexistence.md) | v1 / v2 assistant coexistence via env flag | Accepted |
| [0009](./0009-dedicated-ai-postgres-pgvector.md) | Dedicated AI Postgres (pgvector) independent of VIRLY_DB_DRIVER | Accepted |
| [0010](./0010-swappable-ai-memory-backend.md) | Swappable AI-memory backend via VIRLY_AI_MEMORY_BACKEND | Accepted |
| [0011](./0011-fraud-risk-scoring-rules-plus-knn.md) | Fraud risk scoring: explainable rules + unsupervised kNN; Kaggle model as offline benchmark only | Accepted |
| [0012](./0012-fraud-hold-email-confirmation-fail-open.md) | Hold high-risk transfers for email confirmation, FAIL-OPEN | Accepted |
| [0013](./0013-support-mcp-server-os-trust-boundary.md) | Read-only Support MCP server with an OS-level trust boundary | Accepted |
| [0014](./0014-self-managed-ai-postgres-tables.md) | Self-managed AI-Postgres tables via CREATE TABLE IF NOT EXISTS | Accepted |
