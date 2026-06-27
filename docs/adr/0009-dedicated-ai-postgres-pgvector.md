# ADR-0009: Dedicated AI Postgres (pgvector) independent of VIRLY_DB_DRIVER

**Status:** Accepted
**Date:** 2026-06-27
**Source:** `server/src/db/vector.ts` (`resolveAiPgUrl`, `runAiMigrations`, `CREATE EXTENSION IF NOT EXISTS vector`); `server/src/config.ts` (`resolveAiPgUrl`, lines 131–139, `VIRLY_AI_PG_URL` / `VIRLY_VECTOR_DB_URL` fallback to `VIRLY_POSTGRES_URL`); `server/drizzle-ai/0000_init_knowledge.sql`; `docker-compose.yml` (service `image: pgvector/pgvector:pg16`, line 100).

---

## Context

Virly's main OLTP store is selected at boot by `VIRLY_DB_DRIVER` (`mongo` |
`postgres`). RAG embeddings, the LangGraph long-term store, and the fraud-flag
table all need Postgres with the `pgvector` extension, regardless of which OLTP
driver is in use. Embedding them in the same Drizzle schema as the app's
Postgres store would pollute the app migration history and couple the two
concerns. Running them in MongoDB is not an option because `pgvector` is
Postgres-specific.

## Decision

AI/ML data (RAG document chunks, LangGraph checkpointer and long-term store
tables, fraud flags) lives in a dedicated Postgres that is always reachable,
even when `VIRLY_DB_DRIVER=mongo`. The connection URL is resolved by
`resolveAiPgUrl()` in `server/src/db/vector.ts`, with the precedence:
`VIRLY_AI_PG_URL` > `VIRLY_VECTOR_DB_URL` > `config.rag.aiPgUrl` (which itself
falls back to `VIRLY_POSTGRES_URL`). This lets a single Postgres instance serve
both the app and the AI store in development, while a production environment can
point them at separate hosts.

The `pgvector` extension is enabled idempotently in `runAiMigrations()` before
any migration runs, so migration ordering is never an issue. The migration
history is tracked in `__drizzle_migrations_ai` (not the default
`__drizzle_migrations`), so the two histories cannot clobber each other when
the AI store shares a Postgres with the app. The `docker-compose.yml` service
uses `pgvector/pgvector:pg16` rather than stock Postgres.

## Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Store vectors in MongoDB (e.g. Atlas Vector Search) | Requires a MongoDB Atlas subscription; eliminates the ability to run fully locally with open-source tooling; not available in Mongo Community. |
| Reuse the app's Drizzle schema and `__drizzle_migrations` table | Couples AI-store migrations to app DB migrations; breaks when `VIRLY_DB_DRIVER=mongo` (no app Postgres); makes independent deployment of each store impossible. |
| Separate Postgres host always required | Forces unnecessary operational complexity in local dev and CI; the fallback to `VIRLY_POSTGRES_URL` keeps single-host dev trivial. |

## Status

Accepted — `server/src/db/vector.ts`, `server/drizzle-ai/`, and the
`docker-compose.yml` pgvector service are live. `npm run rag:migrate` applies
the AI-store migrations independently of `npm run db:migrate`.

## Consequences

**Positive:** The AI store is always available regardless of `VIRLY_DB_DRIVER`
choice; migration histories are independent and cannot conflict; the pgvector
extension is guaranteed before any migration tries to create a `vector` column.

**Negative / trade-offs:** Operators must ensure `VIRLY_AI_PG_URL` (or a
fallback) points to a Postgres with the pgvector extension available; a second
database endpoint adds ops surface area in production.

**Neutral / follow-on work:** `VIRLY_AI_MEMORY_BACKEND=postgres` (ADR-0010)
and the fraud-flag / held-transfer tables (ADR-0014) all consume the same
`getAiDb()` singleton, so they inherit this routing decision. The Phase M1.5
target is a single AI Postgres that hosts vectors, checkpointer, and long-term
store together. See also [`../ai/architecture.md`](../ai/architecture.md) and
[`../configuration.md`](../configuration.md).
