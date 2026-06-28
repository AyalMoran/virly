# Backend area: Data layer (repositories / seam)

> The driver-agnostic persistence seam, its two implementations, the Mongoose
> models, and the guard test that keeps model access contained. No HTTP
> endpoints. See [`../index.md`](../index.md) for the layering rules.

**Seam:** `server/src/repositories/{types.ts,registry.ts,index.ts}`
**Implementations:** `server/src/repositories/mongo/*`,
`server/src/repositories/postgres/*`
**Models (Mongo backing):** `server/src/models/*`
**Guard:** `server/src/repositories/no-direct-model-imports.test.ts`

## The seam

Services depend only on **interfaces**, never on a concrete driver:

- **`types.ts`** declares one interface per aggregate — `UserRepository`,
  `TransactionRepository`, `PersonalDetailsRepository`,
  `ExchangeRateRepository`, `AiConversationRepository`,
  `AiPendingTransferRepository`, `AiAuditLogRepository`,
  `VideoSessionRepository`, `VideoAuditLogRepository` — plus the umbrella
  `Repositories` type (`{ users, transactions, personalDetails, exchangeRates,
  aiConversations, aiPendingTransfers, aiAuditLogs, videoSessions,
  videoAuditLogs }`). It also exports the shared enum value sets
  (`videoSessionTypeValues`, etc.).
- **`registry.ts`** — `createRepositories(driver)` returns the Mongo or Postgres
  bundle (`createMongoRepositories()` / `createPostgresRepositories()`).
- **`index.ts`** — a process singleton: `setRepositories(repos)` is called once
  at boot (`server/src/db.ts`), and `getRepositories()` is how services reach
  the data layer. `clearRepositories()` supports test isolation. It re-exports
  `types.ts`.

## Implementations

| Driver | Directory | Entry | Backing |
|--------|-----------|-------|---------|
| Mongo (default) | `repositories/mongo/` | `createMongoRepositories()` | Mongoose models in `server/src/models/*`. |
| Postgres | `repositories/postgres/` | `createPostgresRepositories()` | SQL schema in `repositories/postgres/schema.ts`. |

Each directory has one `*.repository.ts` per aggregate, plus mapping helpers
(`mongo/transaction.ts`, `postgres/transaction.ts`), the Postgres `id.ts`
(row id ⇄ app string id), `errors.ts` (driver error → `AppError`), and
`schema.ts`. See [`_inventory.md`](../_inventory.md) for the full file list.

## Models

The nine Mongoose schemas under `server/src/models/` are the Mongo driver's
backing store, **not** an application-wide data API: `User`, `PersonalDetails`,
`Transaction`, `ExchangeRate`, `AiConversation`, `AiPendingTransfer`,
`AiAuditLog`, `VideoSession`, `VideoAuditLog`. They are imported **only** by
`repositories/mongo/*` (and the eval harness). The Postgres path never touches
them.

## The guard test

`server/src/repositories/no-direct-model-imports.test.ts` walks every non-test
`.ts` file under `server/src/` and fails if any file imports `../models/*`,
**except** files under `repositories/mongo/` or `ai/evals/`. This is what keeps
the seam honest: a route or service that reaches into a Mongoose model directly
turns the test red and is named in the failure. See
[`../index.md`](../index.md#the-no-direct-model-imports-guard) for the rule it
enforces.

## AI Postgres (pgvector)

A **dedicated** Postgres instance (or schema) for the AI data store, entirely
independent of the app's OLTP driver. It is reachable even when the app DB
driver is set to `mongo`.

**Connection:** `server/src/db/vector.ts` — `getAiDb()` returns a Drizzle
`NodePgDatabase` backed by a `pg.Pool`. Connection string is resolved in
priority order: `VIRLY_AI_PG_URL` → `VIRLY_VECTOR_DB_URL` →
`config.rag.aiPgUrl`. `resolveAiPgUrl()` centralises this precedence so it
stays in one place across all AI Postgres consumers (the Drizzle pool and the
LangGraph checkpointer).

**Schema and migrations:** `server/src/repositories/vector/schema.ts` defines
two Drizzle tables managed by the AI Postgres migration history (`server/drizzle-ai/`,
migration tracking table `__drizzle_migrations_ai` — a separate table from the
app's `__drizzle_migrations` to keep the two histories independent even when
both stores share the same Postgres instance). Applied via `npm run rag:migrate`
(`runAiMigrations()` in `db/vector.ts`):

| Table | Managed by | Purpose |
|-------|-----------|---------|
| `knowledge_documents` | Drizzle migration | One row per ingested source file; unique on `(source, sourceRef)`. |
| `knowledge_chunks` | Drizzle migration | Embedded chunks; `embedding vector(1536)` with HNSW cosine index. |
| `ai_fraud_flags` | `fraud/service.ts` (self-managed, `CREATE TABLE IF NOT EXISTS`) | Post-commit fraud risk flags (level medium/high only). |
| `held_transfers` | `fraud/holds.ts` (self-managed, `CREATE TABLE IF NOT EXISTS`) | Held-transfer intent + SHA-256 token hash + lifecycle status. |
| `fraud_transactions` | `fraud/repository.ts` (self-managed, `CREATE TABLE IF NOT EXISTS`) | Kaggle benchmark feature vectors (offline pipeline; not used at request time). |

The fraud module's three tables are **self-managed** (not in the Drizzle
migration history) because they own their own `CREATE TABLE IF NOT EXISTS`
idempotent setup at first use.

**Repository:** `server/src/repositories/vector/knowledge.repository.ts` —
`knowledgeRepository` singleton. Its interface and types are in
`repositories/vector/types.ts`. Unlike the app repositories (which live behind
the driver-switched seam), this repository always targets the AI Postgres
directly via `getAiDb()`.

The full RAG pipeline that writes to and reads from these tables is documented
in the [RAG knowledge area](rag-knowledge.md). The fraud tables are documented
in the [Fraud area](fraud.md).

## Cross-cutting

- Driver selection happens once at boot (`server/src/db.ts`,
  `server/src/config.ts`); nothing downstream knows which driver is live.
- The AI Postgres is independent of the driver switch: it is always Postgres,
  always reached via `getAiDb()`, and its schema has its own migration history.
- The Postgres migration that introduced the app-repo seam is summarised in
  [`../../improvements/README.md`](../../improvements/README.md).
