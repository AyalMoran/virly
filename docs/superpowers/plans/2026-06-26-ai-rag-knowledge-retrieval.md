# AI RAG Knowledge Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the v2 assistant a `searchKnowledgeBase` tool that retrieves
relevant snippets from a curated corpus (policies, FAQs, fees, upsell copy) via
vector similarity, so answers about "the rules" come from a real source instead of
the model's memory — fully disabled and inert by default so tests stay deterministic.

**Architecture:** A `KnowledgeStore` interface (`search(query, k) -> Snippet[]`)
sits behind a v2 read-only tool. The production implementation is a pgvector table
in Postgres, populated by an ingestion script that chunks + embeds markdown docs
under `server/src/ai/knowledge/corpus/`. Embeddings use OpenAI
`text-embedding-3-small` via `@langchain/openai`. The whole feature is gated by
`VIRLY_RAG_ENABLED` (default `false`); when off, the tool is not bound to the model
at all, so no test path changes. This is a self-contained slice — the corpus source
(local files now, Google Drive later via the [Google Drive MCP plan](2026-06-26-google-drive-mcp-content-source.md))
feeds the same ingestion seam.

**Tech Stack:** Node ESM + TypeScript, `@langchain/openai` (embeddings), `pg`
(pgvector), `node:test` + `tsx`. v2 LangGraph agent (`server/src/ai/v2/`).

**Design spec:** none separate — this plan is the spec (per the user's
plans-only directive). See "Approach & rationale" below.

## Global Constraints

- ESM: every relative import ends in `.js` (TypeScript `nodenext`).
- Server unit tests: `cd server && npm test` (`tsx --test "src/**/*.test.ts"`).
- All paths below are relative to `server/` unless stated otherwise.
- Feature is OFF by default (`VIRLY_RAG_ENABLED` unset/`false`). With it off, no tool
  is bound, no embedding call is made, and every existing test passes unchanged.
- RAG is **read-only and advisory**. It NEVER influences a number, balance, transfer
  amount, confirmation, or warning. It only supplies policy/FAQ prose. The
  money-movement gate (architecture doc §4) is untouched.
- pgvector store is independent of `VIRLY_DB_DRIVER`: it has its own
  `VIRLY_RAG_POSTGRES_URL` (may equal `VIRLY_POSTGRES_URL`), so RAG works even when
  the app runs on Mongo.
- TDD: write the failing test, watch it fail, implement, watch it pass, commit.

## Approach & rationale

Three approaches were considered:

1. **Tool the agent calls (chosen).** Add a v2 read-only tool `searchKnowledgeBase`.
   The LLM decides when a question is policy-shaped and calls it. Fits the existing
   "agent ⇄ tools" loop and the documented "How to add a v2 tool" recipe; no graph
   topology change; retrieval cost is paid only when relevant.
2. **Inject retrieved context at `prepare` every turn.** Simpler call path but
   embeds + retrieves on every message (cost, latency) and pollutes the prompt cache
   prefix. Rejected.
3. **Stuff the whole corpus into the system prompt.** No infra, but unbounded prompt
   growth and stale-by-edit. Rejected.

Storage: pgvector reuses infra already in the repo (`pg`, Postgres). An interface
seam (`KnowledgeStore`) keeps the choice swappable and lets tests use an in-memory
fake. Gating by env keeps CI deterministic and free.

## File Structure

| File | Responsibility |
|---|---|
| `src/config.ts` (modify) | Add `config.ai.rag` block: `enabled`, `postgresUrl`, `embeddingModel`, `topK`, `minScore`. |
| `src/ai/knowledge/types.ts` (create) | `Snippet`, `KnowledgeStore` interface, `EmbeddingClient` interface. |
| `src/ai/knowledge/embeddings.ts` (create) | `createOpenAiEmbeddingClient()` wrapping `OpenAIEmbeddings`. |
| `src/ai/knowledge/pgvectorStore.ts` (create) | pgvector-backed `KnowledgeStore` (`search`, `upsertChunks`, `ensureSchema`). |
| `src/ai/knowledge/inMemoryStore.ts` (create) | Test/dev fake `KnowledgeStore` (cosine over a JS array). |
| `src/ai/knowledge/chunk.ts` (create) | `chunkMarkdown(text, opts) -> Chunk[]` (heading-aware, size-bounded). |
| `src/ai/knowledge/registry.ts` (create) | `getKnowledgeStore()` boot singleton (null when disabled). |
| `src/ai/knowledge/ingest.ts` (create) | `ingestCorpus(dir, store, embedder)` — read → chunk → embed → upsert. |
| `src/ai/knowledge/ingest.cli.ts` (create) | CLI entry: `npm run rag:ingest`. |
| `src/ai/knowledge/corpus/` (create) | Markdown source docs (seed: `fees.md`, `transfer-policy.md`, `faq.md`). |
| `src/ai/v2/tools/knowledge.ts` (create) | `searchKnowledgeBase` LangChain tool. |
| `src/ai/v2/tools/index.ts` (modify) | Conditionally include the knowledge tool when RAG enabled. |
| `src/ai/v2/tools/descriptions.ts` (modify) | Add the tool's description string. |
| `package.json` (server, modify) | Add `rag:ingest` script; add `@langchain/openai` already present; add `pgvector` SQL via raw `pg` (no new dep). |

---

## Task 1: Config block for RAG (off by default)

**Files:**
- Modify: `src/config.ts`
- Test: `src/config.rag.test.ts`

**Interfaces:**
- Produces: `config.ai.rag: { enabled: boolean; postgresUrl?: string; embeddingModel: string; topK: number; minScore: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/config.rag.test.ts
import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  const mod = await import(`./config.js?ts=${Date.now()}`);
  process.env = prev;
  return mod.config as typeof import("./config.js").config;
}

test("rag disabled by default", async () => {
  const config = await loadConfig({ VIRLY_RAG_ENABLED: undefined });
  assert.equal(config.ai.rag.enabled, false);
  assert.equal(config.ai.rag.embeddingModel, "text-embedding-3-small");
  assert.equal(config.ai.rag.topK, 4);
});

test("rag enabled reads its own postgres url and falls back to app url", async () => {
  const config = await loadConfig({
    VIRLY_RAG_ENABLED: "true",
    VIRLY_POSTGRES_URL: "postgres://app",
    VIRLY_RAG_POSTGRES_URL: undefined
  });
  assert.equal(config.ai.rag.enabled, true);
  assert.equal(config.ai.rag.postgresUrl, "postgres://app");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/config.rag.test.ts`
Expected: FAIL — `config.ai.rag` is undefined.

- [ ] **Step 3: Implement the config block**

In `src/config.ts`, inside the existing `ai` config object, add a `rag` field. Use the existing `getStringEnv`/`getBooleanEnv`/`getNumberEnv` helpers (match whatever helpers `config.ts` already exposes; if a boolean helper is absent, parse `=== "true"`):

```ts
// within the ai: { ... } block
rag: {
  enabled: getStringEnv("VIRLY_RAG_ENABLED", "false").trim().toLowerCase() === "true",
  postgresUrl:
    getStringEnv("VIRLY_RAG_POSTGRES_URL", "").trim() ||
    getStringEnv("VIRLY_POSTGRES_URL", "").trim() ||
    undefined,
  embeddingModel: getStringEnv("VIRLY_RAG_EMBEDDING_MODEL", "text-embedding-3-small").trim(),
  topK: Number(getStringEnv("VIRLY_RAG_TOP_K", "4")) || 4,
  minScore: Number(getStringEnv("VIRLY_RAG_MIN_SCORE", "0.2")) || 0.2
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/config.rag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/config.rag.test.ts
git commit -m "feat(ai): add RAG config block (disabled by default)"
```

---

## Task 2: Knowledge types and markdown chunker

**Files:**
- Create: `src/ai/knowledge/types.ts`
- Create: `src/ai/knowledge/chunk.ts`
- Test: `src/ai/knowledge/chunk.test.ts`

**Interfaces:**
- Produces:
  - `type Snippet = { id: string; source: string; heading: string | null; text: string; score: number }`
  - `type Chunk = { source: string; heading: string | null; text: string }`
  - `interface EmbeddingClient { embed(texts: string[]): Promise<number[][]> }`
  - `interface KnowledgeStore { search(query: string, k: number): Promise<Snippet[]>; upsertChunks(chunks: Array<Chunk & { embedding: number[] }>): Promise<void> }`
  - `function chunkMarkdown(text: string, opts?: { source: string; maxChars?: number }): Chunk[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/chunk.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarkdown } from "./chunk.js";

test("splits on headings and carries the heading", () => {
  const md = "# Fees\nWe charge ₪5.\n\n## Limits\nDaily cap is ₪10000.\n";
  const chunks = chunkMarkdown(md, { source: "fees.md" });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].heading, "Fees");
  assert.match(chunks[0].text, /₪5/);
  assert.equal(chunks[1].heading, "Limits");
  assert.equal(chunks[1].source, "fees.md");
});

test("splits an over-long section into size-bounded chunks", () => {
  const body = "x".repeat(2500);
  const chunks = chunkMarkdown(`# Big\n${body}`, { source: "big.md", maxChars: 1000 });
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.text.length <= 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/chunk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types and chunker**

```ts
// src/ai/knowledge/types.ts
export type Snippet = {
  id: string;
  source: string;
  heading: string | null;
  text: string;
  score: number;
};

export type Chunk = { source: string; heading: string | null; text: string };

export interface EmbeddingClient {
  embed(texts: string[]): Promise<number[][]>;
}

export interface KnowledgeStore {
  search(query: string, k: number): Promise<Snippet[]>;
  upsertChunks(chunks: Array<Chunk & { embedding: number[] }>): Promise<void>;
}
```

```ts
// src/ai/knowledge/chunk.ts
import type { Chunk } from "./types.js";

const DEFAULT_MAX = 1200;

/** Heading-aware markdown chunker: one chunk per heading section, then split any
 *  section longer than maxChars into contiguous slices. */
export function chunkMarkdown(
  text: string,
  opts: { source: string; maxChars?: number }
): Chunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX;
  const lines = text.split("\n");
  const sections: Array<{ heading: string | null; body: string[] }> = [];
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] };

  for (const line of lines) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) {
      if (current.heading !== null || current.body.some((l) => l.trim())) {
        sections.push(current);
      }
      current = { heading: m[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.heading !== null || current.body.some((l) => l.trim())) {
    sections.push(current);
  }

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const body = section.body.join("\n").trim();
    if (!body) {
      continue;
    }
    for (let i = 0; i < body.length; i += maxChars) {
      chunks.push({
        source: opts.source,
        heading: section.heading,
        text: body.slice(i, i + maxChars)
      });
    }
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/chunk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/types.ts server/src/ai/knowledge/chunk.ts server/src/ai/knowledge/chunk.test.ts
git commit -m "feat(ai): knowledge store types and markdown chunker"
```

---

## Task 3: In-memory knowledge store (cosine search)

**Files:**
- Create: `src/ai/knowledge/inMemoryStore.ts`
- Test: `src/ai/knowledge/inMemoryStore.test.ts`

**Interfaces:**
- Consumes: `KnowledgeStore`, `EmbeddingClient`, `Chunk`, `Snippet` (Task 2).
- Produces: `function createInMemoryKnowledgeStore(embedder: EmbeddingClient): KnowledgeStore`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/inMemoryStore.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import type { EmbeddingClient } from "./types.js";
import { createInMemoryKnowledgeStore } from "./inMemoryStore.js";

// Deterministic fake: 2-D embeddings keyed by a substring, so "limit"-ish text
// lands near a "limit" query and far from a "fee" query.
const fakeEmbedder: EmbeddingClient = {
  async embed(texts) {
    return texts.map((t) =>
      /limit|cap/i.test(t) ? [1, 0] : /fee|charge/i.test(t) ? [0, 1] : [0.5, 0.5]
    );
  }
};

test("returns the most similar chunk first", async () => {
  const store = createInMemoryKnowledgeStore(fakeEmbedder);
  await store.upsertChunks([
    { source: "a.md", heading: "Limits", text: "Daily cap is high", embedding: [1, 0] },
    { source: "b.md", heading: "Fees", text: "We charge a fee", embedding: [0, 1] }
  ]);
  const hits = await store.search("what is my daily limit", 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].heading, "Limits");
  assert.ok(hits[0].score > 0.9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/inMemoryStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the in-memory store**

```ts
// src/ai/knowledge/inMemoryStore.ts
import type { Chunk, EmbeddingClient, KnowledgeStore, Snippet } from "./types.js";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function createInMemoryKnowledgeStore(
  embedder: EmbeddingClient
): KnowledgeStore {
  const rows: Array<Chunk & { id: string; embedding: number[] }> = [];
  return {
    async upsertChunks(chunks) {
      for (const c of chunks) {
        rows.push({ ...c, id: `${c.source}#${rows.length}` });
      }
    },
    async search(query, k) {
      const [q] = await embedder.embed([query]);
      const scored: Snippet[] = rows.map((r) => ({
        id: r.id,
        source: r.source,
        heading: r.heading,
        text: r.text,
        score: cosine(q, r.embedding)
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/inMemoryStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/inMemoryStore.ts server/src/ai/knowledge/inMemoryStore.test.ts
git commit -m "feat(ai): in-memory knowledge store with cosine search"
```

---

## Task 4: pgvector store + embedding client

**Files:**
- Create: `src/ai/knowledge/pgvectorStore.ts`
- Create: `src/ai/knowledge/embeddings.ts`
- Test: `src/ai/knowledge/pgvectorStore.sql.test.ts` (pure SQL-builder unit test; no live DB)

**Interfaces:**
- Consumes: `KnowledgeStore`, `EmbeddingClient`, `Chunk`, `Snippet`.
- Produces:
  - `function createOpenAiEmbeddingClient(opts: { apiKey: string; model: string }): EmbeddingClient`
  - `function createPgVectorStore(opts: { pool: import("pg").Pool; embedder: EmbeddingClient; dimensions: number }): KnowledgeStore & { ensureSchema(): Promise<void> }`
  - `function buildSearchSql(k: number): string` (exported for the unit test)

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/pgvectorStore.sql.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchSql } from "./pgvectorStore.js";

test("search sql orders by cosine distance and limits k", () => {
  const sql = buildSearchSql(4);
  assert.match(sql, /from\s+rag_chunks/i);
  assert.match(sql, /embedding\s*<=>\s*\$1/i); // pgvector cosine distance operator
  assert.match(sql, /order by/i);
  assert.match(sql, /limit\s+4/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/pgvectorStore.sql.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement embeddings + pgvector store**

```ts
// src/ai/knowledge/embeddings.ts
import { OpenAIEmbeddings } from "@langchain/openai";
import type { EmbeddingClient } from "./types.js";

export function createOpenAiEmbeddingClient(opts: {
  apiKey: string;
  model: string;
}): EmbeddingClient {
  const client = new OpenAIEmbeddings({ apiKey: opts.apiKey, model: opts.model });
  return {
    async embed(texts) {
      return client.embedDocuments(texts);
    }
  };
}
```

```ts
// src/ai/knowledge/pgvectorStore.ts
import type { Pool } from "pg";
import type { Chunk, EmbeddingClient, KnowledgeStore, Snippet } from "./types.js";

/** pgvector cosine-distance query. Distance is 1 - cosine_similarity, so score
 *  is reported as (1 - distance). `$1` is the query vector literal. */
export function buildSearchSql(k: number): string {
  const limit = Math.max(1, Math.floor(k));
  return `
    select id, source, heading, text, 1 - (embedding <=> $1) as score
    from rag_chunks
    order by embedding <=> $1
    limit ${limit}
  `;
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export function createPgVectorStore(opts: {
  pool: Pool;
  embedder: EmbeddingClient;
  dimensions: number;
}): KnowledgeStore & { ensureSchema(): Promise<void> } {
  const { pool, embedder, dimensions } = opts;
  return {
    async ensureSchema() {
      await pool.query("create extension if not exists vector");
      await pool.query(`
        create table if not exists rag_chunks (
          id bigserial primary key,
          source text not null,
          heading text,
          text text not null,
          embedding vector(${dimensions}) not null
        )
      `);
      await pool.query(
        "create index if not exists rag_chunks_embedding_idx on rag_chunks using hnsw (embedding vector_cosine_ops)"
      );
    },
    async upsertChunks(chunks: Array<Chunk & { embedding: number[] }>) {
      for (const c of chunks) {
        await pool.query(
          "insert into rag_chunks (source, heading, text, embedding) values ($1,$2,$3,$4)",
          [c.source, c.heading, c.text, toVectorLiteral(c.embedding)]
        );
      }
    },
    async search(query, k): Promise<Snippet[]> {
      const [q] = await embedder.embed([query]);
      const result = await pool.query(buildSearchSql(k), [toVectorLiteral(q)]);
      return result.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        source: String(r.source),
        heading: r.heading == null ? null : String(r.heading),
        text: String(r.text),
        score: Number(r.score)
      }));
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/pgvectorStore.sql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/pgvectorStore.ts server/src/ai/knowledge/embeddings.ts server/src/ai/knowledge/pgvectorStore.sql.test.ts
git commit -m "feat(ai): pgvector knowledge store and OpenAI embedding client"
```

---

## Task 5: Store registry (boot singleton, null when disabled)

**Files:**
- Create: `src/ai/knowledge/registry.ts`
- Test: `src/ai/knowledge/registry.test.ts`

**Interfaces:**
- Consumes: `config.ai.rag` (Task 1), `KnowledgeStore` (Task 2).
- Produces: `function getKnowledgeStore(): KnowledgeStore | null`, `function setKnowledgeStore(store: KnowledgeStore | null): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/registry.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { getKnowledgeStore, setKnowledgeStore } from "./registry.js";

test("returns null until a store is set", () => {
  setKnowledgeStore(null);
  assert.equal(getKnowledgeStore(), null);
});

test("returns the store once set", () => {
  const fake = { async search() { return []; }, async upsertChunks() {} };
  setKnowledgeStore(fake);
  assert.equal(getKnowledgeStore(), fake);
  setKnowledgeStore(null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

```ts
// src/ai/knowledge/registry.ts
import type { KnowledgeStore } from "./types.js";

let store: KnowledgeStore | null = null;

export function setKnowledgeStore(next: KnowledgeStore | null): void {
  store = next;
}

export function getKnowledgeStore(): KnowledgeStore | null {
  return store;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/registry.ts server/src/ai/knowledge/registry.test.ts
git commit -m "feat(ai): knowledge store boot registry"
```

---

## Task 6: `searchKnowledgeBase` v2 tool (only bound when enabled)

**Files:**
- Create: `src/ai/v2/tools/knowledge.ts`
- Modify: `src/ai/v2/tools/descriptions.ts`
- Modify: `src/ai/v2/tools/index.ts`
- Test: `src/ai/v2/tools/knowledge.test.ts`

**Interfaces:**
- Consumes: `getKnowledgeStore()` (Task 5), `config.ai.rag` (Task 1), the existing v2 `tool(...)` + Zod pattern (see `tools/readOnly.ts`).
- Produces: `searchKnowledgeBase` tool; `knowledgeTools: ReturnType<typeof tool>[]` (empty array when RAG disabled), spread into `allTools` in `tools/index.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/v2/tools/knowledge.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { setKnowledgeStore } from "../../knowledge/registry.js";
import { searchKnowledgeBase } from "./knowledge.js";

test("returns a no-knowledge-base notice when store is unset", async () => {
  setKnowledgeStore(null);
  const out = await searchKnowledgeBase.invoke({ query: "fees" });
  assert.match(String(out), /no knowledge base/i);
});

test("formats top snippets from the store", async () => {
  setKnowledgeStore({
    async upsertChunks() {},
    async search() {
      return [
        { id: "1", source: "fees.md", heading: "Fees", text: "We charge ₪5.", score: 0.9 }
      ];
    }
  });
  const out = await searchKnowledgeBase.invoke({ query: "what fees" });
  assert.match(String(out), /Fees/);
  assert.match(String(out), /₪5/);
  setKnowledgeStore(null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/v2/tools/knowledge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool + wiring**

Add to `src/ai/v2/tools/descriptions.ts`:

```ts
export const searchKnowledgeBaseDescription =
  "Search Virly's policy/FAQ/fees knowledge base for the authoritative wording on " +
  "rules, fees, limits, and product info. Use ONLY for general policy/FAQ questions, " +
  "never for this user's account numbers (use the account tools for those). Returns " +
  "short source-attributed snippets; quote them, do not invent policy.";
```

```ts
// src/ai/v2/tools/knowledge.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { config } from "../../../config.js";
import { getKnowledgeStore } from "../../knowledge/registry.js";
import { searchKnowledgeBaseDescription } from "./descriptions.js";

export const searchKnowledgeBase = tool(
  async ({ query }: { query: string }) => {
    const store = getKnowledgeStore();
    if (!store) {
      return "No knowledge base is configured. Answer from your general guidance and do not invent Virly-specific policy.";
    }
    const hits = await store.search(query, config.ai.rag.topK);
    const useful = hits.filter((h) => h.score >= config.ai.rag.minScore);
    if (useful.length === 0) {
      return "No matching policy/FAQ entries were found for that question.";
    }
    return useful
      .map((h) => `• [${h.source}${h.heading ? ` › ${h.heading}` : ""}] ${h.text}`)
      .join("\n");
  },
  {
    name: "searchKnowledgeBase",
    description: searchKnowledgeBaseDescription,
    schema: z.object({
      query: z.string().describe("The policy/FAQ question to look up.")
    })
  }
);

/** Bound to the model only when RAG is enabled, so the off path is byte-identical. */
export const knowledgeTools = config.ai.rag.enabled ? [searchKnowledgeBase] : [];
```

In `src/ai/v2/tools/index.ts`, import `knowledgeTools` and spread it into the `allTools` array alongside `readOnlyTools` (place it with the read-only tools, NOT money tools):

```ts
import { knowledgeTools } from "./knowledge.js";
// ...
export const allTools = [...readOnlyTools, ...knowledgeTools, ...moneyTools];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/v2/tools/knowledge.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the AI safety suite to confirm no contract drift**

Run: `cd server && npx tsx --test src/ai/tests/aiSafety.test.ts`
Expected: PASS — with RAG disabled, the bound-tool set is unchanged.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/v2/tools/knowledge.ts server/src/ai/v2/tools/descriptions.ts server/src/ai/v2/tools/index.ts server/src/ai/v2/tools/knowledge.test.ts
git commit -m "feat(ai): searchKnowledgeBase v2 tool, bound only when RAG enabled"
```

---

## Task 7: Corpus + ingestion script

**Files:**
- Create: `src/ai/knowledge/corpus/fees.md`, `transfer-policy.md`, `faq.md` (seed content)
- Create: `src/ai/knowledge/ingest.ts`
- Create: `src/ai/knowledge/ingest.cli.ts`
- Modify: `server/package.json` (add `rag:ingest` script)
- Test: `src/ai/knowledge/ingest.test.ts`

**Interfaces:**
- Consumes: `chunkMarkdown` (Task 2), `EmbeddingClient`, `KnowledgeStore`.
- Produces: `async function ingestCorpus(input: { dir: string; store: KnowledgeStore; embedder: EmbeddingClient }): Promise<{ files: number; chunks: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/ingest.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddingClient } from "./types.js";
import { createInMemoryKnowledgeStore } from "./inMemoryStore.js";
import { ingestCorpus } from "./ingest.js";

const fakeEmbedder: EmbeddingClient = {
  async embed(texts) {
    return texts.map(() => [1, 0]);
  }
};

test("reads markdown files, chunks, embeds, and upserts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rag-"));
  await writeFile(join(dir, "a.md"), "# Fees\nWe charge ₪5.\n");
  await writeFile(join(dir, "b.md"), "# Limits\nDaily cap ₪10000.\n");
  const store = createInMemoryKnowledgeStore(fakeEmbedder);
  const out = await ingestCorpus({ dir, store, embedder: fakeEmbedder });
  assert.equal(out.files, 2);
  assert.ok(out.chunks >= 2);
  const hits = await store.search("fees", 2);
  assert.ok(hits.length >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/ingest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ingestion + seed corpus + CLI**

```ts
// src/ai/knowledge/ingest.ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkMarkdown } from "./chunk.js";
import type { EmbeddingClient, KnowledgeStore } from "./types.js";

export async function ingestCorpus(input: {
  dir: string;
  store: KnowledgeStore;
  embedder: EmbeddingClient;
}): Promise<{ files: number; chunks: number }> {
  const entries = (await readdir(input.dir)).filter((f) => f.endsWith(".md"));
  let chunkCount = 0;
  for (const file of entries) {
    const text = await readFile(join(input.dir, file), "utf8");
    const chunks = chunkMarkdown(text, { source: file });
    if (chunks.length === 0) {
      continue;
    }
    const embeddings = await input.embedder.embed(chunks.map((c) => c.text));
    await input.store.upsertChunks(
      chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }))
    );
    chunkCount += chunks.length;
  }
  return { files: entries.length, chunks: chunkCount };
}
```

```ts
// src/ai/knowledge/ingest.cli.ts
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../../config.js";
import { createOpenAiEmbeddingClient } from "./embeddings.js";
import { createPgVectorStore } from "./pgvectorStore.js";
import { ingestCorpus } from "./ingest.js";

async function main() {
  if (!config.ai.rag.enabled) {
    throw new Error("Set VIRLY_RAG_ENABLED=true to ingest the corpus.");
  }
  if (!config.ai.rag.postgresUrl) {
    throw new Error("Set VIRLY_RAG_POSTGRES_URL (or VIRLY_POSTGRES_URL).");
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "corpus");
  const pool = new Pool({ connectionString: config.ai.rag.postgresUrl });
  const embedder = createOpenAiEmbeddingClient({
    apiKey: config.ai.openAIApiKey,
    model: config.ai.rag.embeddingModel
  });
  // text-embedding-3-small is 1536-dimensional.
  const store = createPgVectorStore({ pool, embedder, dimensions: 1536 });
  await store.ensureSchema();
  await pool.query("truncate rag_chunks");
  const out = await ingestCorpus({ dir, store, embedder });
  console.log(`Ingested ${out.chunks} chunks from ${out.files} files.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Seed `src/ai/knowledge/corpus/fees.md` (and similarly `transfer-policy.md`, `faq.md`) with real, short policy prose, e.g.:

```markdown
# Transfer fees
Virly charges no fee for transfers between Virly accounts in ILS.

# Limits
The default per-transfer limit and daily limit are set by the account's transfer
limits; the assistant reads them live with the transfer-limits tool.
```

Add to `server/package.json` scripts:

```json
"rag:ingest": "tsx src/ai/knowledge/ingest.cli.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/corpus server/src/ai/knowledge/ingest.ts server/src/ai/knowledge/ingest.cli.ts server/src/ai/knowledge/ingest.test.ts server/package.json
git commit -m "feat(ai): corpus seed + ingestion script (rag:ingest)"
```

---

## Task 8: Boot wiring (build the store when enabled)

**Files:**
- Modify: `src/index.ts`
- Create: `src/ai/knowledge/boot.ts`
- Test: `src/ai/knowledge/boot.test.ts`

**Interfaces:**
- Consumes: `config.ai.rag`, `createPgVectorStore`, `createOpenAiEmbeddingClient`, `setKnowledgeStore`.
- Produces: `async function initKnowledgeStore(): Promise<void>` — no-op when disabled; builds + registers pgvector store when enabled.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/boot.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { getKnowledgeStore, setKnowledgeStore } from "./registry.js";
import { initKnowledgeStore } from "./boot.js";

test("init is a no-op when RAG is disabled (default)", async () => {
  setKnowledgeStore(null);
  await initKnowledgeStore(); // VIRLY_RAG_ENABLED unset in test env
  assert.equal(getKnowledgeStore(), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/boot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement boot and wire into `index.ts`**

```ts
// src/ai/knowledge/boot.ts
import { Pool } from "pg";
import { config } from "../../config.js";
import { createOpenAiEmbeddingClient } from "./embeddings.js";
import { createPgVectorStore } from "./pgvectorStore.js";
import { setKnowledgeStore } from "./registry.js";

export async function initKnowledgeStore(): Promise<void> {
  if (!config.ai.rag.enabled || !config.ai.rag.postgresUrl) {
    setKnowledgeStore(null);
    return;
  }
  const pool = new Pool({ connectionString: config.ai.rag.postgresUrl });
  const embedder = createOpenAiEmbeddingClient({
    apiKey: config.ai.openAIApiKey,
    model: config.ai.rag.embeddingModel
  });
  const store = createPgVectorStore({ pool, embedder, dimensions: 1536 });
  await store.ensureSchema();
  setKnowledgeStore(store);
}
```

In `src/index.ts`, call it during bootstrap (after `initRepositories()`):

```ts
import { initKnowledgeStore } from "./ai/knowledge/boot.js";
// inside bootstrap(), after initRepositories():
await initKnowledgeStore();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/boot.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npm test`
Expected: PASS — RAG off by default, no behaviour change.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/knowledge/boot.ts server/src/ai/knowledge/boot.test.ts server/src/index.ts
git commit -m "feat(ai): wire knowledge store into boot (no-op when disabled)"
```

---

## Task 9: Docs + env example

**Files:**
- Modify: `.env.example` (root and/or `server/` — there are two per the docs-workflow memory)
- Modify: `docs/ai/architecture.md` (add a short "RAG knowledge retrieval" subsection under §4)

- [ ] **Step 1: Add env vars to `.env.example`**

```
# RAG knowledge retrieval (optional; off by default)
VIRLY_RAG_ENABLED=false
VIRLY_RAG_POSTGRES_URL=
VIRLY_RAG_EMBEDDING_MODEL=text-embedding-3-small
VIRLY_RAG_TOP_K=4
VIRLY_RAG_MIN_SCORE=0.2
```

- [ ] **Step 2: Document the tool in `docs/ai/architecture.md`**

Add a subsection under §4 "Safety & extension" describing `searchKnowledgeBase`: it
is read-only, advisory, bound only when `VIRLY_RAG_ENABLED=true`, never affects
numbers/confirmations, and is fed by `rag:ingest` from `corpus/` (or Google Drive —
link to the Google Drive MCP plan).

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/ai/architecture.md
git commit -m "docs(ai): document RAG knowledge retrieval and env flags"
```

---

## Self-Review

- **Spec coverage:** corpus ingestion (T7), vector store (T4), retrieval tool (T6),
  config gate (T1), boot (T8), docs (T9) — the full "incorporate RAG" item is covered,
  with the corpus source pluggable for the Google Drive plan.
- **Placeholder scan:** none — every step has concrete code or concrete prose.
- **Type consistency:** `KnowledgeStore.search`/`upsertChunks` and `Snippet`/`Chunk`
  used identically across in-memory, pgvector, ingest, tool, and boot. `embed(texts)`
  signature consistent across `EmbeddingClient` impls.

## Open questions (answer later — see aggregated list in the chat)

1. **Corpus content & ownership** — what real docs seed the KB (fees, transfer
   policy, FAQ, upsell scripts)? Who maintains them?
2. **pgvector availability** — is a Postgres with the `vector` extension available in
   the target env, or should the default store be something else?
3. **Personas & RAG** — should all four personas retrieve, or only some? (Plan binds
   for all; tone still governed by persona rules.)
4. **Upsell vs policy** — is upsell copy in-scope for the same store, or kept separate
   (it carries a sales intent, not a neutral policy fact)?
