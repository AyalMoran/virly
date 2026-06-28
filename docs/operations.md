# Operations Runbook

> **Scope:** Local dev stack bring-up, production build/run, database operations
> (Mongo ↔ Postgres cutover and rollback), RAG knowledge-base management, fraud
> detection tooling, and first-response for common failure modes.
> **Audience:** Anyone who runs, deploys, or recovers the app.
> **Related docs:**
> - [Configuration reference](configuration.md) — all env vars and fail-fast rules
> - [Testing guide](testing.md) — test bring-up (docker-compose.test.yml)
> - [AI architecture](ai/architecture.md) — RAG pipeline, vector store, fraud scoring design
> - [Security model](security.md) — MCP trust boundary, fraud hold controls
> - [Postgres migration design §12](superpowers/specs/2026-06-22-postgres-migration-design.md#12-cutover--rollback-runbook) — original cutover spec

---

## 1. Prerequisites

### Tooling

| Tool | Minimum | Notes |
|---|---|---|
| Docker + Compose v2 | `docker compose version` | `docker compose` (space, not hyphen) |
| Node.js | 22.x | Only needed when running scripts outside Docker |
| `tsx` | ≥ 4.19 | Installed as a dev dependency; use `npx tsx` or `./node_modules/.bin/tsx` |

### Credentials / access

See [configuration.md](configuration.md) for the full env-var table and
fail-fast rules. Minimum for local dev:

- `server/.env` file populated from `server/.env.example`
- `VIRLY_JWT_SECRET` — required in production (≥ 32 chars); the placeholder
  `change-me-in-production` is tolerated locally only
- `OPENAI_API_KEY` — required for AI assistant routes
- `RESEND_API_KEY` — required for email delivery (verification, etc.)

For Postgres mode, additionally:

- `VIRLY_POSTGRES_URL` — required when `VIRLY_DB_DRIVER=postgres` (server
  throws at boot without it; see [configuration.md](configuration.md))
- `VIRLY_DB_DRIVER=postgres` — set in `server/.env` or the process environment

For the AI/RAG/fraud subsystem (always required when using any `rag:*`,
`fraud:*`, `eval:policy-rag`, or `mcp:support` scripts):

- `VIRLY_AI_PG_URL` — connection string for the dedicated pgvector Postgres.
  In the local compose stack this defaults to
  `postgres://virly:virly@postgres:5432/virly` (wired automatically). For
  `rag:sync` and `eval:policy-rag`, `OPENAI_API_KEY` must also be set.

Do **not** re-list the full variable set here; [configuration.md](configuration.md)
is the single source of truth.

### Persistent Docker volume

The local stack stores MongoDB data in an external named volume:

```
virly_mongo-data
```

Create it once before the first `docker compose up`:

```sh
docker volume create virly_mongo-data
```

---

## 2. Bring-up

### 2.1 Local stack (docker-compose.yml)

The compose file at the repo root defines five services:

| Service | Purpose |
|---|---|
| `app` | Express API server — dev mode (`tsx watch`) |
| `frontend` | Vite dev server |
| `mongo` | MongoDB 7, replica set `rs0` |
| `mongo-init` | One-shot `rs0` initiator |
| `postgres` | Dedicated AI Postgres (`pgvector/pgvector:pg16`, port 5432) — vector store for RAG, fraud transactions, held transfers, and fraud flags |

**Step-by-step bring-up:**

```sh
# 1. Create the persistent volume (skip if already created)
docker volume create virly_mongo-data

# 2. Copy the env template and fill in your values
cp server/.env.example server/.env
# Edit server/.env: set VIRLY_JWT_SECRET, OPENAI_API_KEY, RESEND_API_KEY, ...

# 3. Start the stack (with hot-reload)
docker compose up

# 4. Verify the API is healthy
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}

# 5. (First run) Apply the AI-store schema (pgvector extension + knowledge tables)
cd server
npm run rag:migrate
# VIRLY_AI_PG_URL is already in the compose environment; run this from outside
# the container with VIRLY_AI_PG_URL=postgres://virly:virly@localhost:5432/virly
# if you are not inside the app container.
```

The `app` service will not start until:
- `mongo` passes its healthcheck (`mongosh --eval "db.adminCommand('ping').ok"`)
- `mongo-init` completes (initiates replica set `rs0`)
- `postgres` passes its healthcheck (`pg_isready -U virly`)

**Watch mode** (`develop.watch`) is enabled: edits under `server/src/` sync
into the container live; changes to `package.json` or `tsconfig.json` trigger
a rebuild.

**Health endpoint:** `GET /api/health` returns `{"status":"ok"}` with HTTP 200.
Defined in `server/src/app.ts:64`.

#### How env vars reach the app

`docker-compose.yml` wires `server/.env` via:

```yaml
env_file:
  - ./server/.env
```

The compose environment block then overrides four values:

```yaml
environment:
  NODE_ENV: development
  VIRLY_PORT: ${VIRLY_PORT:-3000}
  VIRLY_MONGODB_URI: ${VIRLY_MONGODB_URI:-mongodb://mongo:27017/virly?replicaSet=rs0}
  VIRLY_AI_PG_URL: ${VIRLY_AI_PG_URL:-postgres://virly:virly@postgres:5432/virly}
```

`VIRLY_MONGODB_URI` defaults to the in-compose hostname `mongo` and appends the
`replicaSet=rs0` query parameter — see section 2.2 for why.

`VIRLY_AI_PG_URL` defaults to the in-compose `postgres` service. The `postgres`
service runs `pgvector/pgvector:pg16` (a superset of `postgres:16`) so the
`vector` extension is available. `rag:migrate` creates the extension and applies
the AI-store migrations — it does not run at app boot; you must run it explicitly
(step 5 above).

_Validated against `docker-compose.yml:17` (VIRLY_AI_PG_URL default) and
`docker-compose.yml:99-114` (postgres service definition)._

#### Why MongoDB runs as replica set `rs0`

MongoDB must run as a replica set because `transfer.service` and
`aiPendingTransfer.service` perform money movement inside **multi-document
transactions** (`session.withTransaction()`). MongoDB only supports
multi-document transactions on replica sets, not on standalone `mongod`.

**Where `rs0` is configured:**

1. `docker-compose.yml:70` — the `mongo` service command:
   ```yaml
   command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
   ```
2. `docker/mongo-init.sh` — the `mongo-init` service initiates the set after
   `mongo` is healthy:
   ```sh
   mongosh "$URI" --quiet --eval "try { rs.initiate($CONFIG); } catch (e) { ... }"
   ```
   where `CONFIG='{ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] }'`

**Where transactions are required:**

The repository abstraction (`Repositories.runInTransaction`) wraps
`session.withTransaction()` in Mongo mode — see the Postgres design spec
[§3 Transaction / unit-of-work abstraction](superpowers/specs/2026-06-22-postgres-migration-design.md#3-transaction--unit-of-work-abstraction-load-bearing).

### 2.2 Production build and run (Dockerfile)

The `Dockerfile` has three stages:

| Stage | Base | What it does |
|---|---|---|
| `dev` | `node:22-alpine` | Installs deps with `npm ci --workspace server`; used by compose in dev mode. Start command: `npm run dev --workspace server` (runs `tsx watch src/index.ts`) |
| `build` | extends `dev` | Compiles TypeScript (`npm run build --workspace server` → `tsc`), then prunes dev dependencies |
| (prod, unnamed) | `node:22-alpine` | Copies `server/dist/` and production `node_modules` from `build`. `ENV NODE_ENV=production`. Start command: `npm run start --workspace server` (runs `node dist/index.js`) |

**To build and run the production image locally:**

```sh
# Build the production image (uses the unnamed final stage)
docker build --target "" -t virly-server:prod .
# Or simply omit --target to reach the final stage:
docker build -t virly-server:prod .

# Run it (provide env vars at runtime)
docker run --rm \
  --env-file server/.env \
  -e NODE_ENV=production \
  -e VIRLY_MONGODB_URI=mongodb://<host>:27017/virly?replicaSet=rs0 \
  -e VIRLY_AI_PG_URL=postgres://<user>:<pass>@<host>:5432/virly \
  -p 3000:3000 \
  virly-server:prod
```

**Prerequisite:** Docker daemon must be running. A reachable MongoDB replica set,
a reachable pgvector Postgres (for the AI store), and (if
`VIRLY_DB_DRIVER=postgres`) a reachable OLTP Postgres instance are required at
runtime. Run `npm run rag:migrate` against the AI Postgres before the first
production boot, or after any `rag:generate` run that produces a new migration.

---

## 3. Database operations

### 3.1 Mongo vs Postgres mode at boot

The boot-time flag `VIRLY_DB_DRIVER` selects the active database driver. The
default is `mongo`.

`server/src/index.ts` calls:

```ts
await connectDb();          // always connects Mongoose (LangGraph needs it in both modes)
await initRepositories();   // additionally opens the Postgres pool + runs migrations when driver=postgres
if (config.dbDriver === "postgres") startTtlSweeper();
startDailyFxRefresh();
```

In `server/src/db.ts`:

- `connectDb()` always opens a Mongoose connection (`config.mongoUri`).
- `initRepositories()` in Postgres mode calls `getPgDb()` (opens the Drizzle/pg
  pool) and `runPgMigrations()` (applies Drizzle migrations), then registers the
  Postgres repository implementations. In Mongo mode the pool is never opened and
  migrations never run.

**Note (LangGraph hybrid):** Even in Postgres mode the Mongoose connection stays
open — the v2 AI agent's `MongoDBSaver` checkpointer and `MongoDBStore` still use
MongoDB in Phase 1. `VIRLY_MONGODB_URI` is therefore always required.

### 3.2 TTL sweeper (Postgres mode only)

MongoDB provides native TTL indexes on `aiConversations.expiresAt` and
`aiPendingTransfers.expiresAt` that auto-delete expired documents. PostgreSQL has
no TTL indexes, so in Postgres mode an in-process sweeper runs instead.

**Sweeper behaviour** (`server/src/ttl/sweeper.ts`):

- `startTtlSweeper(intervalMs = 60_000)` — starts a `setInterval` that fires
  every **60 seconds** (default). The timer is `unref()`'d so it never keeps the
  process alive by itself.
- `sweepExpired()` — on each tick deletes:
  - rows from `ai_conversations` where `expires_at < now()`
  - rows from `ai_pending_transfers` where `expires_at < now()`
  - rows from `verification_tokens` where `expires_at < now()`
- Active-row queries already filter `expires_at > now()`, so the sweeper's only
  effect is storage reclamation.

**Mongo mode:** native TTL indexes handle expiry on the same collections
(`aiConversations`, `aiPendingTransfers`, and `verificationtokens`) via their
`expiresAt` field. No sweeper is started (`server/src/index.ts:11` guards the call
with `if (config.dbDriver === "postgres")`).

The `exchange_rates` table/collection is **not** subject to TTL in either mode.

### 3.3 Cutover runbook — Mongo → Postgres

Run this procedure inside a **maintenance window** (brief write downtime while
data is synced). All `tsx scripts/` commands are run from inside `server/`:

**Prerequisites:**
- `VIRLY_MONGODB_URI` — pointing to the source MongoDB replica set
- `VIRLY_POSTGRES_URL` — pointing to the target Postgres instance
- Both set in `server/.env` or the shell environment

```sh
cd server
```

**Step 1 — Provision Postgres and apply the schema migrations:**

```sh
npx tsx -e "import('./src/db/postgres.js').then(m => m.runPgMigrations()).then(() => process.exit(0))"
# Or equivalently:
npm run db:migrate
```

_Validated against `server/package.json:12`: `db:migrate` runs the tsx inline
script above. Requires `VIRLY_POSTGRES_URL` in env._

**Step 2 — Sync Mongo data into Postgres (idempotent — safe to re-run):**

```sh
npx tsx scripts/sync-mongo-to-postgres.ts
```

_Validated against `server/scripts/sync-mongo-to-postgres.ts:7` comment:
`tsx scripts/sync-mongo-to-postgres.ts`. Upserts every document keyed on `id`;
exits 1 on failure. Requires: `VIRLY_MONGODB_URI`, `VIRLY_POSTGRES_URL`._

**Step 3 — Verify zero mismatches (GATE — do not proceed if this exits non-zero):**

```sh
npx tsx scripts/verify-parity.ts
```

`verify-parity.ts` compares row counts and SHA-256 checksums over canonicalised
records for every entity. It prints a per-entity table and exits 1 on any
mismatch. **The cutover must not proceed unless this command exits 0.**

_Validated against `server/scripts/verify-parity.ts:88`:
`process.exit(mismatches === 0 ? 0 : 1)`. Requires: `VIRLY_MONGODB_URI`,
`VIRLY_POSTGRES_URL`._

**Step 4 — Flip the driver and restart:**

Set in `server/.env` (or the deployment environment):

```
VIRLY_DB_DRIVER=postgres
```

Then restart the app (compose or production process). No code changes are
required — the flag is read at boot.

**Step 5 — Smoke-test the live app:**

```sh
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}
```

Run any additional functional checks appropriate for your deployment.

### 3.4 Rollback runbook — Postgres → Mongo

Run this if you need to revert a Postgres cutover. Uses the reverse sync script.

**Prerequisites:** Same as cutover — both `VIRLY_MONGODB_URI` and
`VIRLY_POSTGRES_URL` must be reachable.

```sh
cd server
```

**Step 1 — Sync Postgres data back into Mongo (idempotent):**

```sh
npx tsx scripts/sync-postgres-to-mongo.ts
```

_Validated against `server/scripts/sync-postgres-to-mongo.ts:8` comment:
`tsx scripts/sync-postgres-to-mongo.ts`. Upserts each row via `bulkWrite` with
`timestamps: false` to preserve original `createdAt`/`updatedAt`. Exits 1 on
failure. Requires: `VIRLY_MONGODB_URI`, `VIRLY_POSTGRES_URL`._

**Step 2 — Verify zero mismatches (GATE — do not proceed if this exits non-zero):**

```sh
npx tsx scripts/verify-parity.ts
```

Same verification gate as the cutover. **Do not flip the flag until this exits 0.**

**Step 3 — Flip the driver back to Mongo and restart:**

Set in `server/.env` (or the deployment environment):

```
VIRLY_DB_DRIVER=mongo
```

Restart the app. No code changes are required.

**Step 4 — Smoke-test:**

```sh
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}
```

### 3.5 Verification-token store rollout (one-time)

Email-verification tokens moved off the `users` row / `User` document into a
dedicated `verification_tokens` store. Rolling this out is a one-time data
migration; the destructive part is automated and ordering-safe.

**Postgres — automatic and atomic.** Migration `0003_omniscient_inhumans.sql`
backfills the inline `users.verification_token_hash` rows into
`verification_tokens` and **then** drops the two inline columns, in a single
migration (drizzle runs each migration in a transaction). Applying migrations the
normal way — `npm run db:migrate`, or boot-time `runPgMigrations()` in Postgres
mode — therefore backfills before dropping; the order cannot be inverted, and a
backfill failure rolls the drop back. No manual step is required, and it is a
no-op on a fresh database.

**Mongo — one manual, non-destructive step.** Mongo never physically drops the
inline fields, so there is no ordering hazard, but the new collection must be
populated once. Run it with a connection string that **includes the database
name** (otherwise `db` targets the `test` database):

```sh
mongosh "mongodb://<host>:27017/<dbname>?replicaSet=rs0" server/scripts/migrate-verification-tokens.mongodb.js
```

Idempotent (upsert by `userId`), safe to re-run. Legacy rows with no stored expiry
default to `now + 24h`, which is harmless because the verification JWT itself
already expires in 10 minutes.

---

## 4. Troubleshooting and escalation

### 4.1 Database unreachable

**Symptoms:** Server fails to start; Mongoose throws a connection error printed to
stderr; or (Postgres mode) `runPgMigrations()` throws before the HTTP server binds.

**First response:**

1. Check the connection string in `server/.env`:
   - `VIRLY_MONGODB_URI` for Mongo (must include `?replicaSet=rs0` when using a
     replica set)
   - `VIRLY_POSTGRES_URL` for Postgres
2. Verify the database service is running and reachable from the app host.
3. In the local compose stack: `docker compose ps` to check service health;
   `docker compose logs mongo` for Mongo logs.
4. If the `mongo-init` service failed (compose shows it exited non-zero), the
   replica set may not have been initiated — re-run with
   `docker compose up mongo-init`.

### 4.2 Missing required env var — fail-fast at boot

**Symptoms:** Server exits immediately at startup with a descriptive error message
(before any HTTP server binds), e.g.:
```
Error: VIRLY_POSTGRES_URL is required when VIRLY_DB_DRIVER=postgres.
Error: VIRLY_JWT_SECRET must be set to a strong secret (>= 32 characters) in production.
```

**First response:**

1. Read the error message — `config.ts` throws with the exact variable name and
   condition.
2. See [configuration.md](configuration.md) for the full fail-fast table and the
   correct value format.
3. Set the missing variable in `server/.env` (local) or the deployment env and
   restart.

All fail-fast conditions are documented in the [Fail-fast boot contract section
of configuration.md](configuration.md#fail-fast-boot-contract).

### 4.3 FX provider down

**Symptoms:** Exchange-rate API calls fail or return stale data; errors logged:
`"Daily FX refresh failed:"` or `"FX provider fetch failed;"`.

**Background:** `startDailyFxRefresh()` (`server/src/services/fx.service.ts:377`)
warms the rate cache at boot and re-checks every **6 hours**
(`FX_REFRESH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000`, line 370). On fetch
failure the server falls back to the latest non-expired cached snapshot. If no
non-expired snapshot exists, `FxUnavailableError` (HTTP 503) is returned to
callers.

**First response:**

1. Check logs for `"FX provider fetch failed"`.
2. Verify the FX provider API key and endpoint:
   - `VIRLY_FX_API_KEY` / `VIRLY_FX_BASE_URL` in `server/.env`
3. If the vendor is down, the fallback cache covers up to `VIRLY_FX_CACHE_TTL_HOURS`
   (default 48 hours) without user impact.
4. If the cache is also expired, currency conversion routes return HTTP 503 until
   the vendor recovers or a new `VIRLY_FX_BASE_URL` is configured.

### 4.4 AI Postgres / pgvector unreachable

**Symptoms:** The app starts but RAG retrieval fails, fraud flags are not written,
or `rag:sync` / `eval:policy-rag` exit with:
`"VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL) is required to use the AI store."`

**Background:** The AI Postgres is separate from the OLTP store. Its absence is
not fatal to the main request path (fraud flag persistence is best-effort;
`recordTransferRiskFlag` swallows errors — `server/src/fraud/service.ts:121`).
Missing `VIRLY_AI_PG_URL` will block `rag:sync`, `rag:migrate`, `eval:policy-rag`,
`fraud:ingest`, and `mcp:support`.

**First response:**

1. Check `VIRLY_AI_PG_URL` in `server/.env`.
2. In the local compose stack: `docker compose ps postgres` — verify the
   `postgres` service is healthy; `docker compose logs postgres` for errors.
3. Confirm the image is `pgvector/pgvector:pg16` (a plain `postgres:16` image
   does not have the `vector` extension and `rag:migrate` will fail).
4. If the schema has never been applied: `npm run rag:migrate` (from `server/`
   with `VIRLY_AI_PG_URL` in env).

### 4.5 Escalation path

_Placeholder — update with on-call contacts, Slack channel, and incident runbook
URL for your team._

For issues not resolved by the steps above:

1. Capture: full server logs, the failing command output, and the relevant env
   variables (redact secrets).
2. Open an incident with the team's on-call engineer.
3. Reference this runbook and note which troubleshooting steps were already tried.

---

## 5. RAG knowledge base

> **See also:** [AI architecture](ai/architecture.md) for the pipeline design, chunk
> schema, and retrieval flow.

The RAG knowledge base stores policy and loan-package documents as 1536-dimension
embeddings in the dedicated AI Postgres (`VIRLY_AI_PG_URL`). It is consumed by
the in-app AI assistant and by the Support MCP server (section 7).

All `npm run` commands in this section are run from `server/`.

### 5.1 AI-store schema — apply (or re-apply) migrations

The AI store has its own independent migration history in `server/drizzle-ai/`
tracked in a separate table (`__drizzle_migrations_ai`) so it never collides with
the OLTP schema. The initial migration creates the `knowledge_documents` and
`knowledge_chunks` tables with an HNSW cosine index on `embedding vector(1536)`.

```sh
# From server/
npm run rag:migrate
```

What this does (validated against `server/package.json:14` and
`server/src/db/vector.ts:62-73`):

1. Calls `getAiDb()` — opens a `pg.Pool` against `VIRLY_AI_PG_URL`.
2. Runs `CREATE EXTENSION IF NOT EXISTS vector` (idempotent).
3. Applies any unapplied migrations from `server/drizzle-ai/` via
   `drizzle-orm/node-postgres/migrator`.

**Requires:** `VIRLY_AI_PG_URL` pointing at a `pgvector/pgvector:pg16` database.

**Note:** `rag:migrate` is NOT run at app boot. Run it once when provisioning a
new environment, and again after `npm run rag:generate` produces a new migration.

To generate a new migration after schema changes (schema source:
`server/src/repositories/vector/schema.ts`, config: `server/drizzle.ai.config.ts`):

```sh
npm run rag:generate
# Then:
npm run rag:migrate
```

_Validated against `server/package.json:13`: `rag:generate` runs
`drizzle-kit generate --config=drizzle.ai.config.ts`._

### 5.2 Sync the knowledge base

`rag:sync` ingests documents from a source into the `knowledge_documents` /
`knowledge_chunks` tables. It is idempotent: unchanged documents (matched by
`source_ref` + revision) are skipped; removed documents are deleted.

**Sources:**

| Flag | Source | Required env |
|---|---|---|
| `--source=drive` (default) | Google Drive folder | `VIRLY_RAG_DRIVE_FOLDER_ID` + `VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON` or `VIRLY_GOOGLE_APPLICATION_CREDENTIALS` |
| `--source=local --dir=<path>` | Local directory | `--dir=<abs-path>` or `VIRLY_RAG_LOCAL_DIR` |

Both sources require `VIRLY_AI_PG_URL` and `OPENAI_API_KEY` (to call the
embeddings API). Pass `--dry-run` to preview the plan without writing or
embedding anything (`OPENAI_API_KEY` is not needed for dry runs).

**Examples:**

```sh
# From server/

# Sync from Google Drive (production path)
npm run rag:sync -- --source=drive

# Sync from a local directory (staging / M1 path)
npm run rag:sync -- --source=local --dir=/abs/path/to/policy-docs

# Dry-run: show what would be ingested, write nothing
npm run rag:sync -- --source=local --dir=/abs/path/to/policy-docs --dry-run

# Re-embed all documents regardless of whether they changed
npm run rag:sync -- --source=drive --force

# Sync only one category
npm run rag:sync -- --source=drive --category=loan-packages
```

_Validated against `server/scripts/sync-knowledge-base.ts:1-14` (header comment
and arg parsing), lines 37-61 (source resolution), and lines 69-76 (env checks)._

**Run order for a fresh environment:**

```sh
# 1. Apply schema (once)
npm run rag:migrate

# 2. Populate embeddings
npm run rag:sync -- --source=drive   # or --source=local

# 3. Optionally verify retrieval quality
VIRLY_RAG_ENABLED=true npm run eval:policy-rag
```

### 5.3 Retrieval-quality eval

`eval:policy-rag` is an **offline eval** that measures recall@k: for each
question in the eval set, did the expected source document appear in the top-k
retrieved chunks?

```sh
# From server/
VIRLY_RAG_ENABLED=true npm run eval:policy-rag

# Override k and the pass threshold
VIRLY_RAG_ENABLED=true npm run eval:policy-rag -- --k=5 --threshold=0.9
```

**Requires:** `VIRLY_AI_PG_URL`, `OPENAI_API_KEY`, `VIRLY_RAG_ENABLED=true`.

The eval set must be authored at
`server/src/ai/evals/policy-rag.examples.jsonl` — one JSON object per line:

```json
{"question": "What is the maximum loan amount?", "expectedSourceRefs": ["loans/products-2026.pdf"]}
```

The script exits non-zero if recall falls below the threshold (default 1.0). Run
after every `rag:sync` that changes the document corpus to catch regressions.

_Validated against `server/scripts/eval-policy-rag.ts:1-9` (header comment),
lines 49-55 (env checks), and lines 73-78 (threshold check and exit code)._

---

## 6. Fraud detection

> **See also:** [AI architecture](ai/architecture.md) for the scoring pipeline,
> [Security model §5](security.md#5-fraud-holds) for the hold flow.

Virly's fraud system has two distinct parts that must not be confused:

| Part | When it runs | What it uses | DB writes |
|---|---|---|---|
| **Live rules-based scoring** | On every transfer (request path) | App repositories — no embeddings | `ai_fraud_flags` (best-effort), `held_transfers` (if held) |
| **Offline Kaggle benchmark** | Manually, as a dev/eval tool | `server/fraud-sample/creditcard.sample.csv` | `fraud_transactions` (in AI Postgres) |

The live scoring (`scoreTransfer` in `server/src/fraud/service.ts`) uses
unsupervised rules plus a kNN anomaly signal over the user's own history. The
Kaggle benchmark trains a logistic regression on labeled credit-card data to
measure how the ML approach would compare — it is **separate** and does not
affect the live scoring path.

### 6.1 Live tables — no migration step required

The live fraud tables are self-managed:

| Table | Managed by | Lives in |
|---|---|---|
| `ai_fraud_flags` | `setupFlagsTable()` in `server/src/fraud/service.ts:74-93` | AI Postgres (`VIRLY_AI_PG_URL`) |
| `held_transfers` | `setupHoldsTable()` in `server/src/fraud/holds.ts:73-98` | AI Postgres (`VIRLY_AI_PG_URL`) |

Both are created with `CREATE TABLE IF NOT EXISTS` on the first call at runtime.
**No migration step is required.** The `rag:migrate` command does not touch them.

### 6.2 Offline benchmark — ingest

`fraud:ingest` parses a Kaggle Credit Card Fraud CSV, fits a StandardScaler,
and bulk-inserts standardized feature vectors into `fraud_transactions` in the AI
Postgres. This is an evaluation store only — it is not read by the live scoring
path.

```sh
# From server/

# Using the bundled demo sample
npm run fraud:ingest -- --file=./fraud-sample/creditcard.sample.csv

# Using the full Kaggle dataset (download separately from kaggle.com/datasets/mlg-ulb/creditcardfraud)
npm run fraud:ingest -- --file=/path/to/creditcard.csv

# Limit rows (useful for quick smoke tests)
npm run fraud:ingest -- --file=./fraud-sample/creditcard.sample.csv --limit=1000
```

The scaler artifact is saved to `server/artifacts/fraud-scaler.json` by default
(override with `--scaler-out=<path>`). The `fraud_transactions` table is created
if it does not exist (no separate setup step needed).

**Requires:** `VIRLY_AI_PG_URL`. No `OPENAI_API_KEY` needed.

_Validated against `server/scripts/fraud-ingest.ts:1-11` (header comment) and
lines 34-36 (env checks)._

### 6.3 Offline benchmark — train

`fraud:train` does a stratified train/test split, fits a logistic regression,
compares it against a kNN baseline on the same split, and saves the serving
artifact `server/artifacts/fraud-model.json` (`{ scaler, model, threshold }`).

```sh
# From server/

# Train on the full Kaggle dataset
npm run fraud:train -- --file=/path/to/creditcard.csv

# Tune hyperparameters
npm run fraud:train -- --file=/path/to/creditcard.csv --epochs=500 --test-frac=0.2

# Save artifact to a custom path
npm run fraud:train -- --file=/path/to/creditcard.csv --out=/tmp/fraud-model.json
```

The script prints a comparison table (PR-AUC, precision, recall, F1 at the
best-F1 threshold) and exits 0 on success.

**Requires:** only `--file`. No database or `VIRLY_AI_PG_URL` needed — training
is entirely in-process.

_Validated against `server/scripts/fraud-train.ts:1-10` (header comment) and
lines 47-53 (arg parsing; no DB import in the file)._

---

## 7. Support MCP server

> **Trust boundary:** The Support MCP server has no per-operator authentication.
> Its trust boundary is OS-level access to the process. It MUST run on a host
> where only authorised internal staff can launch it, using **read-scoped**
> database credentials. See [Security model §6](security.md#6-support-mcp-server)
> for the full control inventory entry (control 25).

`mcp:support` starts the read-only Virly Support MCP server over **stdio**, for
use by internal staff via an MCP client such as Claude Desktop.

```sh
# From server/
npm run mcp:support
```

_Validated against `server/package.json:17`: `mcp:support` runs
`tsx scripts/mcp-support-server.ts`. Transport is stdio
(`server/scripts/mcp-support-server.ts:11-12`). All `console.log` is redirected
to stderr so it cannot corrupt the JSON-RPC stream._

**Requires:** `VIRLY_MONGODB_URI` (or `VIRLY_POSTGRES_URL` in Postgres mode) and
`VIRLY_AI_PG_URL` (for `list_fraud_flags`, `list_held_transfers`, and
`search_policy_docs`). `OPENAI_API_KEY` and `VIRLY_RAG_ENABLED=true` are needed
for `search_policy_docs` to return results.

### 7.1 Operator audit log

Every tool call is written to stderr with the operator identity:

```
[mcp-support][operator=alice] lookup_customer {"customerEmail":"user@example.com"}
```

The operator label comes from `VIRLY_MCP_OPERATOR` (falls back to `$USER` then
`"unknown"`). Set it in the shell before launching:

```sh
VIRLY_MCP_OPERATOR=alice npm run mcp:support
```

_Validated against `server/src/mcp/support.ts:280-291`._

### 7.2 Available tools

| Tool | What it returns |
|---|---|
| `lookup_customer` | Account id, verification status, role, balance, created date — for a given customer email |
| `get_balance` | Current balance |
| `get_recent_transactions` | Most recent transactions |
| `get_transfer_limits` | Per-transfer and daily limits |
| `get_daily_transfer_usage` | How much of today's daily limit has been used |
| `get_pending_transfers` | Pending AI-initiated transfer confirmations |
| `get_counterparty_summary` | Sent/received totals between two accounts |
| `list_fraud_flags` | Recent medium/high fraud flags; filterable by level or customer email |
| `list_held_transfers` | Held-for-confirmation transfers; filterable by status or customer email |
| `search_policy_docs` | Semantic search over the policy knowledge base (requires RAG enabled) |

All tools are **read-only**. No money movement is possible through this server.

### 7.3 Claude Desktop wiring (example)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent for your OS:

```json
{
  "mcpServers": {
    "virly-support": {
      "command": "npm",
      "args": ["run", "mcp:support", "--workspace", "server"],
      "cwd": "/path/to/virly",
      "env": {
        "VIRLY_MCP_OPERATOR": "your-name",
        "VIRLY_AI_PG_URL": "postgres://...",
        "VIRLY_MONGODB_URI": "mongodb://...",
        "OPENAI_API_KEY": "sk-...",
        "VIRLY_RAG_ENABLED": "true"
      }
    }
  }
}
```

Use read-scoped database credentials here — not the same credentials used by
the running app service. See [Security model §6](security.md#6-support-mcp-server).
