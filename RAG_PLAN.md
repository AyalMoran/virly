# RAG Knowledge Base — Design Plan

> Status: **M1 implemented** — vector store, retriever, `searchPolicyDocs`
> tool, local-folder ingestion, and the eval runner are built and tested (520
> unit tests + a pgvector contract suite green; end-to-end ingest+search
> verified). The ingestion source points at the project's existing knowledge
> base (no sample docs are shipped); the eval example set is authored from those
> real documents. M1.5 (checkpointer → Postgres), M2 (Drive), M3 (MCP), M4
> (fraud) remain.
> Resolved M1 questions: (1) migrations run via a **separate `rag:migrate`**
> against the AI Postgres; (2) ingestion starts from a **local folder**.
> Scope of milestone 1: ingest plain policy / loan-package documents into a
> vector store and let a LangGraph **sales-agent** node retrieve them with
> citations. Fraud-transaction vectors are a deliberately separate, later phase.

---

## 1. Guiding decisions (already made)

| Decision | Choice | Rationale |
|---|---|---|
| App OLTP store | Stays switchable via `VIRLY_DB_DRIVER` (`mongo` \| `postgres`) | No change to existing seam |
| Vector store | **pgvector**, committed, regardless of app driver | Reuses existing `pg`/Drizzle toolchain; free local; decoupled |
| Dedicated **AI-data** Postgres | One always-on Postgres for *all* AI/ML data (vectors now; checkpointer + long-term store in Phase M1.5). Connection `VIRLY_AI_PG_URL` (alias `VIRLY_VECTOR_DB_URL`), defaults to `VIRLY_POSTGRES_URL` — NOT the driver-gated `getPgDb()` | Framed as the AI store, not narrowly "vectors", so the checkpointer move (M1.5) is incremental, not a repaint. Must be reachable even in `mongo` mode |
| Embeddings | OpenAI `text-embedding-3-small` via `@langchain/openai` | Already a dependency; 1536-dim, cheap, strong |
| Ingestion | **CLI/manual core** → thin **scheduled** wrapper; webhook documented as the production next step | Testable, demoable, honest architecture story |
| Retrieval path | Sales node calls a **LangChain retriever directly**, wrapped as an agent tool — **no MCP hop** | In-process caller; MCP would add latency + a service for no gain |
| MCP server | **Deferred**. Add later only to expose the *same* retriever to external clients | Thin wrapper over the retriever; building the retriever first costs nothing |
| Drive | A **source** for ingestion only — never on the runtime retrieval path | Drive can't do similarity search; slow + rate-limited |

### The symmetry worth noting
The project already runs a "hybrid": even in `postgres` mode the app still
connects to **Mongo** for the LangGraph checkpointer. This plan is the mirror
image — even in `mongo` mode the app also connects to **Postgres** for the
AI-data store. That store is a dedicated, specialized service orthogonal to
`VIRLY_DB_DRIVER`.

Because this dedicated Postgres is now **always on**, it also becomes the natural
home for the LangGraph checkpointer + long-term store — see **Phase M1.5** below.
End-state: *all AI/ML data → Postgres always; app OLTP → mongo or postgres by
driver*, and Mongo becomes a pure, optional OLTP backend.

---

## 2. Architecture

```
                          INGESTION (build-time, async)
  ┌────────────┐   read    ┌──────────┐  chunk   ┌──────────┐ embed ┌──────────────┐
  │ Google     │──────────▶│  source  │─────────▶│ chunker  │──────▶│ OpenAI       │
  │ Drive /    │           │ adapter  │          │          │       │ embeddings   │
  │ local dir  │           └──────────┘          └──────────┘       └──────┬───────┘
  └────────────┘                                                           │ upsert
                                                                           ▼
                                                            ┌──────────────────────────┐
                                                            │ pgvector (dedicated PG)   │
                                                            │  knowledge_documents      │
                                                            │  knowledge_chunks(vector) │
                                                            └──────────────┬────────────┘
                                                                           │ top-k ANN
                          RETRIEVAL (runtime, per turn)                    │ (cosine)
  user ─▶ LangGraph v2 agent ─▶ sales node ─▶ searchPolicyDocs tool ─▶ retriever
                                                   ▲                       │
                                                   └── cited chunks ───────┘
```

Two pipelines, deliberately separated: **ingestion** (rare, async, deterministic)
vs. **retrieval** (every turn, latency-sensitive). Drive only touches ingestion.

---

## 3. Data model (Drizzle, new tables in a dedicated schema module)

New file `server/src/repositories/vector/schema.ts` (kept out of the
driver-switched `postgres/schema.ts` so migrations are independent):

- **`knowledge_documents`** — one row per source file
  - `id` (char24), `source` (`'drive' | 'local'`), `source_ref` (Drive `fileId`
    or path), `revision` (Drive `revisionId` / content hash), `title`,
    `mime_type`, `category` (`'policy' | 'loan_package' | ...`), `uri`,
    `created_at`, `updated_at`
  - unique index on `(source, source_ref)`
- **`knowledge_chunks`** — one row per embedded chunk
  - `id`, `document_id` (FK), `chunk_index`, `content` (text),
    `token_count`, `embedding` `vector(1536)`, `metadata` jsonb, `created_at`
  - unique index on `(document_id, chunk_index)`
  - **HNSW** index on `embedding` `vector_cosine_ops` (`m=16, ef_construction=64`)

Migration adds `CREATE EXTENSION IF NOT EXISTS vector;` before the tables.

> Drizzle note: `drizzle-orm/pg-core` exposes a `vector` column type. If the
> pinned 0.45 build's `vector` helper is awkward, fall back to a raw-SQL column
> in the generated migration and a `customType` wrapper — the repository layer
> hides this either way.

---

## 4. New / changed code (by integration point)

### Config — `server/src/config.ts`
Add a `rag` block:
- `vectorDbUrl` = `VIRLY_VECTOR_DB_URL` ?? `VIRLY_POSTGRES_URL` (fail fast if
  neither set *and* RAG is enabled)
- `embeddingModel` (`VIRLY_RAG_EMBEDDING_MODEL`, default `text-embedding-3-small`)
- `topK` (`VIRLY_RAG_TOP_K`, default 5), `minScore` (default 0.0)
- `enabled` (`VIRLY_RAG_ENABLED`, default false) — feature flag so the tool is
  inert until the store is provisioned

### Dedicated vector connection — `server/src/db/vector.ts`
Mirror `db/postgres.ts` but read `vectorDbUrl`; expose `getVectorDb()`,
`runVectorMigrations()`, `closeVectorPool()`. **Independent** of `getPgDb()`.

### Repository — `server/src/repositories/vector/knowledge.repository.ts`
- `upsertDocument(doc)`, `replaceChunks(documentId, chunks)`
- `search({ embedding, topK, filter })` → ordered `[{ chunk, document, score }]`
  using `embedding <=> $query` (cosine distance) + optional category filter
- `deleteBySourceRef(...)` for removals on re-sync
Contract-style tests gated on `CONTRACT_VECTOR_URL` (same pattern as the
existing Postgres contract suite).

### Embeddings + retriever — `server/src/ai/rag/`
- `embeddings.ts` — singleton `OpenAIEmbeddings` from config
- `retriever.ts` — `retrievePolicyDocs(query, { topK, category })`: embed query →
  `knowledge.search()` → return chunks **with citation metadata** (title + uri +
  chunk_index). This is the single retrieval entry point the MCP server would
  later wrap.

### Agent tool — wire into v2
- Executor in `server/src/ai/tools/searchPolicyDocs.ts` (+ export from
  `tools/index.ts`)
- Add `searchPolicyDocs` to `AssistantToolName` in `ai/state.ts`
- LangChain `tool()` wrapper in `ai/v2/tools/readOnly.ts` (follow the existing
  `callExecutor` pattern) + a description in `v2/tools/descriptions.ts` + a
  status label ("Looking through policy documents")
- Returns an answer-shaped block listing sources so the UI can render citations

### Sales-agent gating
The schema's `users.role` check **already includes `sales_agent`**. Expose
`searchPolicyDocs` to all roles for milestone 1 (policy docs aren't sensitive),
but structure the tool registry so it *can* be role-scoped later — the fraud
phase will need that.

### Ingestion — `server/scripts/sync-knowledge-base.ts`
**M1 ships the `local` source only**; the `drive` adapter is M2 but the source
adapter is an interface from day one so M2 is a drop-in.
1. Source adapter: **`local`** (a folder — M1 default for dev/demo/tests). The
   `drive` adapter (`--source=drive --folder=<id>`, Drive API via service
   account) lands in M2 behind the same interface.
2. For each file: skip if `(source_ref, revision)` unchanged (idempotent)
3. Extract text (md/txt/pdf), **chunk** (~800 tokens, ~100 overlap,
   heading-aware), embed in batches, `upsertDocument` + `replaceChunks`
4. Removals: delete docs whose `source_ref` vanished from the source
5. `--dry-run` prints a plan; exit non-zero on any embed/db failure
- `npm run rag:sync` (manual) → a scheduled job is just this on an interval;
  webhook is a documented future trigger that calls the same code path.

### Evals — `server/src/ai/evals/`
A `policy-rag.examples.jsonl` authored against the REAL knowledge base: each line
is `{ "question", "expectedSourceRefs" }`. `npm run eval:policy-rag` asserts the
expected doc appears in top-k (recall@k) — the "how I measure retrieval quality"
story. The runner ships; the example set is created from the actual documents
(not committed sample content).

---

## 5. Migrations & ops

- **Separate `rag:migrate`** (resolved): a dedicated `npm run rag:migrate` runs
  the AI-store migrations against `VIRLY_AI_PG_URL`, fully independent of the
  app's `db:migrate`/`db:generate`. This keeps the AI Postgres schema decoupled
  from the driver-switched app schema and gives the AI store its own migration
  history — which also cleanly hosts the M1.5 checkpointer tables later.
  - Use a separate Drizzle config + migrations folder (e.g.
    `server/drizzle.ai.config.ts` → `server/drizzle-ai/`) so generation/apply
    never collide with the existing `server/drizzle/`.
- `docker-compose.yml`: add a `postgres` (with `pgvector/pgvector` image) service
  so `mongo`-mode local dev still gets an AI store; wire `VIRLY_AI_PG_URL`.
- `.env.example`: document the new vars.

---

## 6. Testing

- Unit: chunker (boundaries, overlap, heading-aware), citation shaping
- Contract: `knowledge.repository` against real pgvector (gated env var)
- Tool: `searchPolicyDocs` wrapper returns cited results / degrades to text on error
- Eval: recall@k on the policy example set

---

## 7. Phase M1.5 — Consolidate LangGraph memory onto Postgres

> **Sequence after M1, as its own phase.** Do NOT bundle into M1 — the
> checkpointer holds live conversation state, and mixing it with the RAG work
> muddies both. Reuses the always-on AI Postgres stood up in M1.

### Why now (and not before)
The README's "Phase-1 hybrid" caveat exists because the checkpointer pins Mongo:
even in `postgres` mode the app still runs Mongo *only* for AI memory. The
standing objection to moving it — "that forces a Postgres dependency in `mongo`
mode" — **disappears once M1 makes Postgres always-on for the AI store.** So the
RAG decision is precisely what unlocks this.

### What moves
Both LangGraph memory pieces are already cleanly abstracted behind interfaces
with in-memory fallbacks, so the blast radius is two files plus wiring:

| File | Interface | From | To |
|---|---|---|---|
| `ai/v2/memory/checkpointer.ts` | `BaseCheckpointSaver` | `MongoDBSaver` | `PostgresSaver` |
| `ai/v2/memory/store.ts` | `BaseStore` | `MongoDBStore` | `PostgresStore` |

Both new savers come from `@langchain/langgraph-checkpoint-postgres`, pointed at
`VIRLY_AI_PG_URL`. The surrounding graph (`prepare`/`persist`, snapshot helpers)
never cares which implementation it gets — it only sees the base interfaces.

### Decision gate (verify before committing)
- `PostgresSaver` (checkpointer) is **definitely** official.
- Confirm `@langchain/langgraph-checkpoint-postgres` ships a **`PostgresStore`**
  with parity to `MongoDBStore` (namespaced `get`/`put`/`search`). If not, either
  hand-roll a small `BaseStore` over Postgres or keep the long-term store on the
  in-memory/Mongo path for now. **Do not start the move until this is confirmed.**

### Cutover (low-drama)
LangGraph threads are recreatable, so do a **clean cutover** (in-flight
conversations reset) rather than a risky state migration — acceptable here.
Keep the Mongo savers behind the existing factory for one release so rollback is
an env flip, mirroring the app-DB driver pattern.

### Payoff
- `postgres` mode becomes **truly single-store**; the hybrid caveat inverts.
- In `postgres` mode the HITL transfer's checkpoint write can share a
  transaction with the pending-transfer write (today they can't be atomic across
  Mongo + Postgres).
- One backup/ops story; Mongo becomes a pure, optional OLTP backend.

---

## 8. Milestones

1. **M1 — Vector store + retriever + tool (this plan).** Local-folder ingestion,
   pgvector, `searchPolicyDocs` in the sales node, citations, evals.
2. **M2 — Google Drive source adapter** — DONE. `createDriveSource` (service-account
   auth, recursive folder walk, Google Docs exported to markdown, idempotent by
   md5/version) behind the same `KnowledgeSource` interface; `rag:sync` defaults
   to `--source=drive`. Scheduled sync is just this on a timer (not yet wired).
3. **M1.5 — Consolidate LangGraph memory onto Postgres** (§7) — DONE (opt-in via
   `VIRLY_AI_MEMORY_BACKEND=postgres`). Decision-gate result: the package ships
   `PostgresSaver` but NO `PostgresStore`, so the long-term store is a hand-rolled
   `BaseStore` over the AI Postgres (`postgresStore.ts`). Default stays `mongo`
   (reversible by env flip). Verified: 8/8 store contract tests incl. parity via
   the real memory helpers; boot creates checkpointer + store tables. Full graph
   turn/resume not run here (needs OpenAI).
4. **M3 — MCP server** — DONE, broader than originally scoped. Instead of a
   RAG-only server, built a read-only **Support MCP server** (`src/mcp/support.ts`,
   `npm run mcp:support`) that exposes the existing read-only executors AND
   `search_policy_docs` to internal staff (e.g. Claude Desktop). Read-only,
   customer-scoped by email; no money movement. Verified end-to-end over the MCP
   in-memory transport (tools/list + tool calls) plus unit tests.
5. **M4 — Fraud-transaction vectors** — IN PROGRESS. Free / embedding-free,
   trained on the Kaggle Credit Card Fraud (ULB) dataset as a demo pipeline.
   - **Phase 1 (kNN baseline) — DONE.** `src/fraud/` (scaler, CSV parser, pgvector
     repository, kNN scorer) + `npm run fraud:ingest`. Features (V1..V28 + scaled
     Amount = 29 dims) are the vector — no embedding model. Stored in the AI
     Postgres with an L2 HNSW index; scored by nearest-neighbor fraud fraction.
     Verified: 11 unit tests + a pgvector contract suite (separable clusters) +
     end-to-end ingest of a committed synthetic sample.
   - **Phase 2 (trained model) — DONE.** Logistic regression in pure TS
     (`logreg.ts`, balanced class weights) trained offline by `npm run fraud:train`;
     runtime scoring is a free dot-product + sigmoid (no Python, no ML runtime
     dep). `metrics.ts` (PR-AUC, precision/recall/F1, best-F1 threshold) +
     `knnEval.ts` give a baseline-vs-model comparison on the same stratified split.
     Saves a `{ scaler, model, threshold }` artifact. LightGBM via m2cgen remains
     the documented accuracy upgrade behind the same artifact shape. Verified: 8
     more unit tests + an end-to-end train run on the synthetic sample.
   - **Phase 3 (real-transfer scoring) — DONE.** A shared `FraudScoringService`
     (`src/fraud/service.ts`) scores REAL Virly transfers with rules
     (`risk.ts`: new counterparty, high amount, near/over daily limit, amount
     spike, odd hour) + unsupervised kNN-anomaly on the user's own history
     (`anomaly.ts`) — no labels, no embeddings. Wired into all three consumers:
     (a) the regular transfer route and (b) the AI confirm path record a
     best-effort flag post-commit (`ai_fraud_flags`, flag-only — hold-until-email
     is a later step); (c) the v2 `prepareTransfer` tool + an `assessTransactionRisk`
     agent tool warn before the user confirms. Scoring reads app repos only (works
     in mongo or postgres mode); flagging writes to the AI Postgres best-effort and
     never affects a transfer. Verified: pure-module unit tests + flags-table SQL.
   Note: the Kaggle-trained model (phases 1-2) stays a separate benchmark; the
   real-transfer path is rules + per-user anomaly on Virly-derived features.
   - **Hold-until-email-confirmation — DONE (regular route).** When
     `VIRLY_FRAUD_HOLD_LEVEL` (off|medium|high, default off) is enabled, a transfer
     at/above that risk level is NOT executed: it is held (`held_transfers` in the
     AI Postgres, one-time token), the sender is emailed confirm/cancel links
     (`GET /api/transactions/held/confirm|cancel`), and the money moves only on
     confirm. Confirm is CAS-guarded so concurrent clicks can't double-spend,
     idempotent, and expiry/cancel safe; any holding failure degrades to a normal
     flagged transfer (never blocks). Verified: a 6-case pgvector contract suite
     (exactly-once, idempotent, wrong-token, cancel, expiry) + a shouldHold unit
     test. Follow-up: wire the same hold into the AI confirm path (needs an
     AiConfirmationResult "held" variant).

> PDF support: DONE. A shared extractor (`ai/rag/pdf.ts`, pdf-parse) turns PDFs
> into text for BOTH the Drive source (`getPdfText`) and the local source (`.pdf`
> files). Other binary types (images, etc.) are still skipped + logged.

---

## 9. Out of scope for M1
- LangGraph checkpointer/store migration (deferred to **M1.5**)
- Webhook-driven Drive sync (documented path, not built)
- MCP server (deferred to M3)
- Fraud vectors (M4)
- Re-ranking / hybrid (BM25 + vector) search — note as a future quality lever
