# Testing Guide

> **Audience:** Contributors running or adding tests and AI evals.
> **Related:** [Operations runbook](operations.md) · [AI architecture](ai/architecture.md)

The repo has three test tiers with different runners, prerequisites, and costs:
unit tests (fast, no external services), contract tests (real databases via Docker),
and AI evals (live LLM, LangSmith).

---

## Tier map

| Tier | Command | Prerequisites | What it proves | When to run |
|---|---|---|---|---|
| **Unit — server** | `npm test --workspace server` | Node, `npm install` | Service logic mocks the repository interface; no live DB | Every PR |
| **Unit — client** | `npm run test:client` | Node, `npm install` | React component rendering and currency logic | Every PR |
| **Contract** | `npm run test:contract --workspace server` | Docker (`pgvector/pgvector:pg16`, Mongo 7), env vars | Both DB drivers satisfy the same repository contract; pgvector store proves kNN and vector search | Before release / nightly CI |
| **AI evals (v1 deterministic)** | `npx tsx server/src/ai/evals/cli.ts` | None for deterministic mode; `OPENAI_API_KEY` + `VIRLY_AI_MODEL` for LLM modes | Graph routing and turn expectations against fixture conversations | PR for deterministic; nightly/pre-release for LLM modes |
| **AI evals (v2 conformance)** | `VIRLY_AI_V2_EVAL=1 npm test --workspace server -- src/ai/evals/v2/__tests__/v2-conformance.test.ts` | `OPENAI_API_KEY`, `VIRLY_AI_MODEL` (from `server/.env`) | V2 assistant behavioural contract (multi-turn, Hebrew/English, coreference) | Nightly / pre-release |
| **LangSmith experiment** | `npx tsx server/src/ai/evals/langsmith/run-experiment.ts` | `OPENAI_API_KEY`, `VIRLY_AI_MODEL`, `LANGSMITH_API_KEY`, dataset synced | Structural contract against uploaded dataset examples | Pre-release / on demand |
| **RAG retrieval eval** | `npm run eval:policy-rag --workspace server` | `VIRLY_AI_PG_URL`, `OPENAI_API_KEY`, `VIRLY_RAG_ENABLED=true`, knowledge base synced | Recall@k for policy document retrieval against a set of labelled questions | After knowledge-base changes / pre-release |

---

## Unit tests

### Runner

Unit tests run on **Jest** (native-ESM mode via `@swc/jest`). Tests use injected
Jest globals (`describe`/`it`/`expect`); `jest` (fn/spyOn/mock) is imported from
`@jest/globals` when needed. Tests are discovered by glob and run in parallel by
default. Server config: `server/jest.config.mjs`; contract config (serial,
self-skipping): `server/jest.contract.config.mjs`; client: `client/jest.config.mjs`.

### Server unit tests (69 files)

**Command (from repo root):**

```bash
npm test --workspace server
# or equivalently:
cd server && npm test
```

This expands to:

```
NODE_OPTIONS=--experimental-vm-modules jest
```

which discovers `src/**/__tests__/**/*.test.ts`. Tests mock at the **repository
interface** (`Repositories` type in `server/src/repositories/types.ts`), so no
live database connection is needed.

> **Note on full-suite runs in this environment:** Some test files require
> configuration that is not present in a clean checkout without a `.env`.
> For example `server/src/videoSession.service.test.ts` needs a Jitsi RSA private
> key (`secretOrPrivateKey must be an asymmetric key when using RS256`) and
> `server/src/ai/tests/aiSafety.test.ts` will attempt to use LangSmith tracing if
> `LANGSMITH_TRACING` is not explicitly set to `false`. To run the full suite
> locally, copy `server/.env.example` to `server/.env` and fill in the required
> values, or set `LANGSMITH_TRACING=false` and any missing secrets to a placeholder.
> Individual test files that have no external deps run cleanly without any `.env`.

**Running a single file (no env required, from `server/`):**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest src/repositories/__tests__/types.test.ts
```

### Client unit tests (30 tests)

**Command (from repo root):**

```bash
npm run test:client
```

This expands to:

```
NODE_OPTIONS=--experimental-vm-modules jest   # discovers client/src/**/__tests__/**/*.test.tsx
```

No live DB or network calls. Tests render React components with `react-dom/test-utils`
and assert on HTML output.

### Architectural guard: `no-direct-model-imports`

`server/src/repositories/no-direct-model-imports.test.ts` is a build-failing
architectural test. It walks every `.ts` source file under `server/src/` (excluding
`.test.ts` files) and asserts that **only** files under `repositories/mongo/` or
`ai/evals/` may import from a `models/` path:

```
assert.deepEqual(offenders, [], `Files still importing models directly: ...`)
```

If any service or route imports a Mongoose model directly (instead of going through
the repository interface), this test fails with the list of offending files. The test
runs as part of the normal server unit suite and does not need any external services.

**Standalone run (from `server/`):**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest src/repositories/__tests__/no-direct-model-imports.test.ts
```

### Fraud detection unit tests (`server/src/fraud/`)

Eight test files cover the fraud pipeline end-to-end at the unit level. All run
without any database or network connection.

| File | What it covers |
|---|---|
| `anomaly.test.ts` | `knnAnomalyScore` — cold-start guard, low score for in-history transfers, high score for outliers, score clamped to `[0, 1]` |
| `csv.test.ts` | `parseCreditCardCsv` — column mapping, numeric parsing, label extraction from raw CSV rows |
| `holds.unit.test.ts` | `shouldHold` policy — `off` / `high` / `medium` thresholds controlling which risk levels trigger a hold |
| `knn.test.ts` | `scoreByKnn` — fraud probability from injected nearest-neighbour search results; no DB |
| `logreg.test.ts` | `trainLogReg` / `predictProba` — gradient-descent logistic regression on toy data |
| `metrics.test.ts` | Precision, recall, F1, accuracy calculations from confusion matrix inputs |
| `risk.test.ts` | `computeRisk` — composite score from amount, counterparty novelty, limit breaches, anomaly signal; explains reasons |
| `scaler.test.ts` | `fitScaler` / `transform` — min-max normalisation, edge cases (zero range, clamp) |

### RAG pipeline unit tests (`server/src/ai/rag/`)

Six test files cover the RAG knowledge-base pipeline. All mock the embedding
model and repository so no live DB or OpenAI call is required.

| File | What it covers |
|---|---|
| `chunk.test.ts` | `chunkDocument` — sliding-window chunking with overlap, token-count targets |
| `ingest.test.ts` | `syncKnowledgeBase` orchestrator — insert, update, and deletion-detection via an in-memory repository and fake source |
| `pdf.test.ts` | `extractPdfText` — PDF text extraction wrapper |
| `retriever.test.ts` | `searchKnowledge` (config-free core) and `retrievePolicyDocs` (env-gated wrapper) with a stub repository |
| `sources/drive.test.ts` | `createDriveSource` — Google Drive source adapter |
| `sources/local.test.ts` | `createLocalSource` — local-filesystem source adapter with PDF support |

### MCP support-server unit tests (`server/src/mcp/support.test.ts`)

Tests `createSupportTools` — the MCP tool definitions exposed by the support
server. Covers tool registration, invocation dispatch, and response formatting
using stub dependencies. No DB or network required.

### AI v2 node unit tests (`server/src/ai/v2/nodes/executeTransfer.test.ts`)

Tests the `executeTransferNode` LangGraph node in isolation. Covers the happy
path, idempotency replay, and error handling using a stub `transferResponseService`
injected through `LangGraphRunnableConfig`. No DB or network required.

### Convention: mocks at the repository interface

Services accept a `Repositories` object (injected at call time). Unit tests
construct a fake `Repositories` object returning controlled data. Mongo models and
Postgres queries are never imported or called in unit tests — the `no-direct-model-imports`
guard enforces this at the source level.

---

## Contract tests (real DB)

Contract tests prove that the Mongo and Postgres repository implementations both
satisfy the same behavioural contract. They run the same test cases against each
driver back-to-back.

**Prerequisites:** Docker must be installed and running.

### 1. Start the test databases

```bash
docker compose -f docker-compose.test.yml up -d --wait
```

This starts:
- **`pgvector/pgvector:pg16`** on host port `5433` (container port `5432`),
  DB/user/password all `virly`. The pgvector image is a superset of `postgres:16`
  and is required so that `knowledge.contract.test.ts` can run `CREATE EXTENSION vector`.
  All other contract suites are unaffected by the image change.
- **Mongo 7** replica-set mode on host port `27018` (container port `27017`).
  The healthcheck initialises the replica set automatically.

### 2. Generate and run Postgres migrations

`db:migrate` connects to Postgres using `VIRLY_POSTGRES_URL` (read by
`server/src/db/postgres.ts` and `drizzle.config.ts`), so export it **before**
running these commands — use the same connection string as `CONTRACT_PG_URL`:

```bash
export VIRLY_POSTGRES_URL="postgres://virly:virly@localhost:5433/virly"

npm run db:generate --workspace server   # generates SQL from schema.ts; no DB connection
npm run db:migrate --workspace server    # applies migrations to VIRLY_POSTGRES_URL
```

`db:generate` expands to `drizzle-kit generate` and only reads
`server/src/repositories/postgres/schema.ts` to emit migration SQL — it does not
open a database connection. `db:migrate` runs the Drizzle migration runner
against `VIRLY_POSTGRES_URL`.

### 3. Set env vars and run the contract suite

```bash
export CONTRACT_PG_URL="postgres://virly:virly@localhost:5433/virly"
export CONTRACT_MONGO_URL="mongodb://localhost:27018/?replicaSet=rs0"
# Required for the fraud, held-transfers, knowledge, and AI memory store contract tests:
export CONTRACT_VECTOR_URL="postgres://virly:virly@localhost:5433/virly"

npm run test:contract --workspace server
```

This expands to:

```
NODE_OPTIONS=--experimental-vm-modules jest --config jest.contract.config.mjs   # serial; tests/contract/**/*.test.ts
```

`--test-concurrency=1` is required because each test truncates/drops the database
between cases.

**The contract harness skips gracefully when env vars are absent.** Reading
`server/tests/contract/harness.ts`:

- If `CONTRACT_PG_URL` is unset, the Postgres subtree skips with the message
  `set CONTRACT_PG_URL to run`.
- If `CONTRACT_MONGO_URL` is unset, the Mongo subtree skips with the message
  `set CONTRACT_MONGO_URL to run`.

The fraud, held-transfers, knowledge, and AI memory store tests check
`CONTRACT_VECTOR_URL` (falling back to `VIRLY_AI_PG_URL`) and skip with
`set CONTRACT_VECTOR_URL (or VIRLY_AI_PG_URL) to run` when absent.

This means `npm run test:contract --workspace server` can be run without Docker
during development — all tests simply skip rather than error.

**13 contract test files total.** The 9 dual-driver tests (Mongo + Postgres) yield
up to 18 top-level test blocks; the 4 pgvector-only tests (fraud, held transfers,
knowledge, AI memory store) add 4 more top-level blocks.

### New contract tests (PR #6)

Five new test files were added in PR #6. They all live in `server/tests/contract/`
and are picked up by the existing `npm run test:contract --workspace server` glob.

| File | Skip env var | What it proves |
|---|---|---|
| `fraud.contract.test.ts` | `CONTRACT_VECTOR_URL` | Inserts labelled feature vectors into `fraud_transactions`, runs kNN scoring against two separable clusters, asserts `ai_fraud_flags` read/filter API |
| `heldTransfers.contract.test.ts` | `CONTRACT_VECTOR_URL` | CAS-based hold lifecycle: confirm-once idempotency, wrong-token rejection, cancellation, expiry, list/filter by status and userId |
| `knowledge.contract.test.ts` | `CONTRACT_VECTOR_URL` | `KnowledgeRepository` against pgvector: upsert-dedup by `(source, sourceRef)`, `replaceChunks` overwrite, cosine-similarity ranking, category/minScore filters, `listDocumentRefs`/`deleteBySourceRef` |
| `aiPendingTransfer.contract.test.ts` | `CONTRACT_PG_URL` / `CONTRACT_MONGO_URL` | `AiPendingTransferRepository` (dual-driver): create/findById round-trip, `findActiveForConversation`, `listActivePendingForUser`, conditional `updateStatus` with version/status/expiry/userId guards, idempotency result merging |
| `aiMemoryStore.contract.test.ts` | `CONTRACT_VECTOR_URL` | `PostgresLongTermStore`: put/get/delete, upsert semantics, namespace prefix search, pagination stability, JSON filter operators, `listNamespaces`, high-level store helpers (`upsertCounterparty`, `upsertPreferences`, `rememberFact`, `readLongTermSnapshot`) |

> **pgvector requirement:** `knowledge.contract.test.ts`, `fraud.contract.test.ts`,
> `heldTransfers.contract.test.ts`, and `aiMemoryStore.contract.test.ts` all call
> `runAiMigrations()` or `setupFraudSchema()` which run `CREATE EXTENSION IF NOT EXISTS vector`.
> This requires the `pgvector/pgvector:pg16` image (see step 1 above).
> `aiPendingTransfer.contract.test.ts` uses the standard dual-driver harness and
> does not need pgvector.

Before running the pgvector contract tests for the first time, run the AI migrations:

```bash
export VIRLY_AI_PG_URL="postgres://virly:virly@localhost:5433/virly"

npm run rag:generate --workspace server   # generates SQL from the AI schema; no DB connection
npm run rag:migrate --workspace server    # applies AI migrations to VIRLY_AI_PG_URL
```

### 4. Tear down

```bash
docker compose -f docker-compose.test.yml down -v
```

---

## AI evals

The repo ships three eval layers. They are **opt-in** — none run during
`npm test` or `npm run test:client` unless you explicitly set the required env vars
or flags.

### V1 fixture evals (`server/src/ai/evals/`)

The v1 layer runs the AI graph against JSON fixture conversations and asserts
structural outcomes turn by turn. It has four modes:

| Mode | Needs LLM | Needs Mongo |
|---|---|---|
| `deterministic` (default) | No | No |
| `llm-dev` | Yes (`OPENAI_API_KEY`, `VIRLY_AI_MODEL`) | No |
| `seeded-mongo` | No | Yes |
| `llm-seeded-mongo` | Yes | Yes |

```bash
# Deterministic mode — no external services required
npx tsx server/src/ai/evals/cli.ts --mode deterministic

# LLM dev mode
OPENAI_API_KEY=sk-... VIRLY_AI_MODEL=gpt-4o \
  npx tsx server/src/ai/evals/cli.ts --mode llm-dev
```

The CLI exits non-zero and prints a JSON summary of failed turns if any assertion fails.

### V2 live conformance suite (`server/src/ai/evals/v2/`)

See the full README at [`../server/src/ai/evals/v2/README.md`](../server/src/ai/evals/v2/README.md).

The v2 suite is a **RED (intentionally failing) TDD suite** — it documents where
the current assistant falls short of the V2 behavioural spec. It is DB-free: the
only live dependency is the LLM.

**Required env:** `OPENAI_API_KEY` and `VIRLY_AI_MODEL` (read from `server/.env`).

```bash
# Run the full v2 conformance suite (from server/ directory)
VIRLY_AI_V2_EVAL=1 LANGSMITH_TRACING=false \
  NODE_OPTIONS=--experimental-vm-modules npx jest src/ai/evals/v2/__tests__/v2-conformance.test.ts

# Run a single scenario by name
VIRLY_AI_V2_EVAL=1 LANGSMITH_TRACING=false \
  NODE_OPTIONS=--experimental-vm-modules npx jest \
  src/ai/evals/v2/__tests__/v2-conformance.test.ts -t "hebrew-coref-transfer"

# Run the persona-tone eval
VIRLY_AI_V2_EVAL=1 LANGSMITH_TRACING=false \
  NODE_OPTIONS=--experimental-vm-modules npx jest src/ai/evals/v2/__tests__/persona-tone.test.ts
```

Without `VIRLY_AI_V2_EVAL=1` the suite prints a skip message and exits — CI stays
green and zero tokens are spent.

### LangSmith dataset and experiments (`server/src/ai/evals/langsmith/`)

See the full README at [`../server/src/ai/evals/langsmith/README.md`](../server/src/ai/evals/langsmith/README.md).

**Required env:**

| Variable | Required for | Notes |
|---|---|---|
| `LANGSMITH_API_KEY` | `sync-dataset.ts` and `run-experiment.ts` | Put in `server/.env` or export |
| `OPENAI_API_KEY` | `run-experiment.ts` | Live model calls |
| `VIRLY_AI_MODEL` | `run-experiment.ts` | e.g. `gpt-4o` |
| `LANGSMITH_PROJECT` | Recommended | Traces land in the correct project |

**Validate examples locally (no credentials needed):**

```bash
npx tsx server/src/ai/evals/langsmith/validate-examples.ts
```

**Sync the dataset to LangSmith (idempotent):**

```bash
# Dry run — prints what would change without uploading
npx tsx server/src/ai/evals/langsmith/sync-dataset.ts --dry-run

# Real sync
npx tsx server/src/ai/evals/langsmith/sync-dataset.ts \
  --dataset "Virly AI Assistant Contract"
```

The sync is non-destructive: it creates missing examples and updates changed ones
(keyed by `metadata.example_id`). It never deletes remote examples.

**Run an experiment:**

```bash
LANGSMITH_TRACING=true \
npx tsx server/src/ai/evals/langsmith/run-experiment.ts \
  --dataset "Virly AI Assistant Contract" \
  --experiment-prefix "virly-ai-assistant-contract"
```

To test the v1 graph rollback: set `VIRLY_AI_GRAPH_VERSION=v1` before the command.

The experiment runner uses DB-free world tools from the v2 eval harness and a
structural `contract` evaluator that checks intent, tool calls, confirmation
recipients and amounts, clarification behaviour, and prohibited claims.

### RAG retrieval eval (`server/scripts/eval-policy-rag.ts`)

The policy-RAG eval measures recall@k: for each labelled question, did the
expected source document appear in the top-k retrieved chunks?

**Run after `npm run rag:sync --workspace server`** (knowledge base must already
be populated):

```bash
VIRLY_RAG_ENABLED=true \
VIRLY_AI_PG_URL="postgres://virly:virly@localhost:5433/virly" \
OPENAI_API_KEY=sk-... \
  npm run eval:policy-rag --workspace server
```

The script exits non-zero if recall falls below the configured threshold
(default `1.0`; override with `--threshold=0.8`). It is offline in the
sense that it does not call LangSmith, but it does call the OpenAI embeddings
API to encode each question. Run it after knowledge-base content changes or
before a release.
