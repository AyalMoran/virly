# RAG Knowledge Base — Design Plan

> Status: **proposed** (plan-first; no code yet)
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
1. Source adapter: `local` (a folder, default for first run / tests) or `drive`
   (Drive API via service account; `--source=drive --folder=<id>`)
2. For each file: skip if `(source_ref, revision)` unchanged (idempotent)
3. Extract text (md/txt/pdf), **chunk** (~800 tokens, ~100 overlap,
   heading-aware), embed in batches, `upsertDocument` + `replaceChunks`
4. Removals: delete docs whose `source_ref` vanished from the source
5. `--dry-run` prints a plan; exit non-zero on any embed/db failure
- `npm run rag:sync` (manual) → a scheduled job is just this on an interval;
  webhook is a documented future trigger that calls the same code path.

### Evals — `server/src/ai/evals/`
A small `policy-rag.examples.jsonl`: question → expected source doc(s).
Eval asserts the expected doc appears in top-k (recall@k) — this is the
"how I measure retrieval quality" story for the interview.

---

## 5. Migrations & ops

- `npm run db:generate` / `db:migrate` extend to the vector schema, **or** a
  parallel `rag:migrate` against `VIRLY_VECTOR_DB_URL` (cleaner separation).
- `docker-compose.yml`: add a `postgres` (with `pgvector/pgvector` image) service
  so `mongo`-mode local dev still gets a vector store; wire `VIRLY_VECTOR_DB_URL`.
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
2. **M1.5 — Consolidate LangGraph memory onto Postgres** (§7). Checkpointer +
   long-term store move to the AI Postgres; gated on the `PostgresStore` check.
3. **M2 — Drive source adapter** + scheduled sync.
4. **M3 — MCP server** wrapping `retrievePolicyDocs` for external clients (only
   if a real external consumer appears).
5. **M4 — Fraud-transaction vectors** — separate tables, separate embedding
   strategy, role-gated tools. Designed later, not now.

---

## 9. Out of scope for M1
- LangGraph checkpointer/store migration (deferred to **M1.5**)
- Webhook-driven Drive sync (documented path, not built)
- MCP server (deferred to M3)
- Fraud vectors (M4)
- Re-ranking / hybrid (BM25 + vector) search — note as a future quality lever
