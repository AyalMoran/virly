# Backend area: RAG knowledge base

> Policy-document ingestion, chunking, embedding, vector storage, and retrieval
> for the AI assistant's `searchPolicyDocs` tool and the Support MCP server.
> No HTTP endpoints; runs as an offline sync script and is queried in-process
> during assistant turns. See [`../index.md`](../index.md) for layering.

> **AI agent behavior is not repeated here.** How the assistant uses retrieved
> citations and when it calls the tool lives in the
> [AI architecture doc](../../ai/architecture.md). The vector data layer
> (pgvector Postgres, migrations) is described in the Data layer area —
> [`data-layer.md`](data-layer.md).

**RAG core:** `server/src/ai/rag/retriever.ts`, `server/src/ai/rag/embeddings.ts`,
`server/src/ai/rag/ingest.ts`, `server/src/ai/rag/chunk.ts`,
`server/src/ai/rag/pdf.ts`

**Sources:** `server/src/ai/rag/sources/types.ts`,
`server/src/ai/rag/sources/local.ts`,
`server/src/ai/rag/sources/drive.ts`,
`server/src/ai/rag/sources/driveClient.ts`

**Vector data layer:** `server/src/db/vector.ts`,
`server/src/repositories/vector/knowledge.repository.ts`,
`server/src/repositories/vector/schema.ts`,
`server/src/repositories/vector/types.ts`

## Architecture

```
Knowledge source           Ingestion pipeline          Vector store
(local folder              syncKnowledgeBase()         knowledge_documents
 or Drive folder)   --->   ├─ source.list()            knowledge_chunks
                           ├─ chunkDocument()           (AI Postgres /
                           ├─ embedDocuments()           pgvector)
                           └─ repository.upsertDocument
                              repository.replaceChunks
                                                              |
                                                              v
Assistant turn (v2)                                   retrievePolicyDocs()
  searchPolicyDocsTool          <--------------------------- embedQuery()
                                                             repository.search()
```

## Retriever — `retriever.ts`

The single retrieval entry point for both the v2 assistant tool and the Support
MCP server.

- **`retrievePolicyDocs(query, options?)`** — environment-gated wrapper: returns
  `{ available: false, reason: "disabled" }` when `config.rag.enabled` is false,
  or `{ available: false, reason: "not_configured" }` when no OpenAI key is set.
  Otherwise calls `searchKnowledge` and maps results to `PolicyDocCitation[]`.
- **`searchKnowledge(params)`** — the injected-dependency core: embeds the query
  string, calls `repository.search`, and maps `KnowledgeSearchHit` rows to
  `PolicyDocCitation` objects (title, category, uri, sourceRef, chunkIndex,
  score, excerpt). Used directly by tests.

`PolicyDocCitation` is the shape that both the v2 tool (`policyDocs.ts`) and
the MCP server (`mcp/support.ts`) return to callers.

## Embeddings — `embeddings.ts`

Process singleton wrapping `@langchain/openai` `OpenAIEmbeddings`. Model and
dimensions from `config.rag.embeddingModel` / `config.rag.embeddingDimensions`
(`text-embedding-3-small`, 1536 by default). Exports:

- `isEmbeddingsConfigured()` — runtime guard (key + model both non-empty).
- `embedQuery(text)` — embeds a single query string.
- `embedDocuments(texts)` — batch embed for ingestion.

## Ingestion — `ingest.ts`

`syncKnowledgeBase(source, options?)` orchestrates a full sync for one source:

1. Lists files from the source (`source.list()`).
2. Looks up existing documents in the repository by source kind.
3. For each file: skips if `revision` matches (idempotent); otherwise chunks,
   embeds, and upserts via `repository.upsertDocument` + `repository.replaceChunks`.
4. Removes documents that were in the DB but are no longer in the source.

Returns a `SyncSummary` (`{ created, updated, skipped, removed, chunks }`).
Accepts a `dryRun` option (logs but does not write) and a `force` option
(re-embeds even unchanged files). Repository and embedder are injectable for
tests.

## Chunker — `chunk.ts`

`chunkDocument(text, options?)` — heading-aware, overlap-preserving splitter:

- Splits at blank lines, keeping markdown headings (`#` ... `######`) attached
  to the following paragraph as `heading` context.
- Groups blocks into chunks up to `maxTokens` (default 800 approximate tokens;
  approximated as `ceil(length / 4)` — no tokenizer dependency).
- Carries a `overlapTokens`-sized tail of the previous chunk into the next for
  retrieval continuity (default 100).
- Hard-splits single blocks that exceed `maxTokens` on their own.

Returns `Chunk[]`: `{ chunkIndex, content, tokenCount, heading? }`.

## PDF extraction — `pdf.ts`

`extractPdfText(data: Uint8Array)` — wraps `pdf-parse` v2, strips the
`-- N of M --` page-separator lines it injects, and returns clean plain text.
Used by both `sources/local.ts` and `sources/driveClient.ts`.

## Sources

All sources implement `KnowledgeSource` (`sources/types.ts`):

```ts
interface KnowledgeSource {
  readonly kind: KnowledgeDocumentSource;  // "local" | "drive"
  list(): Promise<SourceFile[]>;
}
```

`SourceFile` carries: `sourceRef` (stable identity), `revision` (change
detection key), `title`, `mimeType`, `category`, `uri`, and `content` (plain
text, already extracted from PDF if needed).

### `sources/local.ts`

`createLocalSource(rootDir, categoryOverride?)` — recursively walks a directory
for `.md`, `.markdown`, `.txt`, and `.pdf` files. Revision = SHA-256 of raw
bytes. Category is inferred from the relative path (`"loan"` path segment →
`loan_package`; `"policy"` → `policy`; else null) unless overridden. Titles are
taken from the first markdown heading, falling back to the filename.

### `sources/drive.ts`

`createDriveSource(folderId, client, options?)` — recursively walks a Google
Drive folder via a `DriveClient` abstraction (see below). Skips unsupported mime
types. Revisions use Drive's `md5Checksum` when available, else
`version:modifiedTime`. Exports Google Docs as markdown; downloads text/plain
and text/markdown directly; extracts PDFs via `getPdfText`.

### `sources/driveClient.ts`

`createGoogleDriveClient()` — the only module that imports `googleapis`. Loads
lazily (not at app boot). Authenticates with a service-account credential via
`VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON` (JSON string) or
`VIRLY_GOOGLE_APPLICATION_CREDENTIALS` (key file path), scoped to
`drive.readonly`. Validates Drive folder IDs before interpolating into API
queries to avoid injection. Implements the `DriveClient` interface defined in
`sources/drive.ts`.

## Vector data layer

### `db/vector.ts`

Dedicated AI Postgres connection, independent of the app's DB driver. See the
[Data layer area](data-layer.md#ai-postgres-pgvector) for the full description.
Key exports used here: `getAiDb()`, `runAiMigrations()`.

### `repositories/vector/schema.ts`

Two Drizzle tables managed by the AI Postgres migrations (`drizzle-ai/`):

| Table | Purpose |
|-------|---------|
| `knowledge_documents` | One row per source file: `source`, `sourceRef`, `revision`, `title`, `mimeType`, `category`, `uri`. Unique on `(source, sourceRef)`. |
| `knowledge_chunks` | One row per chunk: `documentId`, `chunkIndex`, `content`, `tokenCount`, `embedding vector(1536)`, `metadata jsonb`. HNSW cosine index on `embedding`. |

`EMBEDDING_DIMENSIONS` = 1536 (must match `config.rag.embeddingDimensions`).

### `repositories/vector/types.ts`

`KnowledgeDocumentSource` (`"local" | "drive"`), `KnowledgeDocumentRecord`,
`KnowledgeChunkInput`, `KnowledgeSearchHit`, `KnowledgeSearchCriteria`,
`KnowledgeDocumentUpsert`, and the `KnowledgeRepository` interface.

### `repositories/vector/knowledge.repository.ts`

`knowledgeRepository` — singleton implementing `KnowledgeRepository` against
the AI Postgres via Drizzle:

- `upsertDocument` — `INSERT ... ON CONFLICT DO UPDATE` on `(source, sourceRef)`.
- `replaceChunks` — delete-all + insert-new in a Drizzle transaction (idempotent
  re-sync).
- `search` — pgvector cosine similarity (`<=>` operator, HNSW index) via raw
  SQL; returns `1 - distance` as `score` in [0, 1], filtered by `minScore`.
  Optionally restricts to a document `category`.
- `listDocumentRefs` — returns `(id, sourceRef, revision)` tuples for removal
  detection during sync.
- `deleteBySourceRef` — deletes chunks then document in a transaction.

## v2 AI tool

`server/src/ai/v2/tools/policyDocs.ts` exports `searchPolicyDocsTool`
(`searchPolicyDocs`), which calls `retrievePolicyDocs` in-process (no MCP hop).
Returns numbered citations for the model to reference. See the
[AI architecture doc](../../ai/architecture.md).

## Ops

| Command | What it does |
|---------|-------------|
| `npm run rag:migrate` | Enables the `vector` extension and applies `drizzle-ai/` migrations to the AI Postgres. |
| `npm run rag:sync` | Runs the ingestion script (`scripts/sync-knowledge-base.ts`) against the configured Drive or local source. |

See the [operations runbook](../../operations.md) for the full ingestion run-order and source flags.

Config keys: `VIRLY_RAG_ENABLED` (`false` by default), `VIRLY_AI_PG_URL`,
`VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON` / `VIRLY_GOOGLE_APPLICATION_CREDENTIALS`
(Drive only). When `VIRLY_RAG_ENABLED=true` and `VIRLY_AI_PG_URL` is unset,
config throws at boot.

## Cross-cutting

- The RAG module is **entirely read-only at request time** (ingestion is a
  separate CLI). It shares the AI Postgres connection (`getAiDb()`) with the
  fraud module but uses only the `knowledge_documents` / `knowledge_chunks`
  tables managed by the Drizzle migrations.
- When RAG is disabled or not configured, `retrievePolicyDocs` returns
  `{ available: false }` rather than throwing, so assistant turns degrade
  cleanly.
