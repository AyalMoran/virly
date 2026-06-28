# Google Drive MCP Content Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the assistant's knowledge base be populated from a Google Drive folder
of policy/upsell documents via an MCP server, so non-engineers can edit a Doc and
re-sync instead of editing markdown in the repo.

**Architecture:** A `ContentSource` interface (`list() -> DriveDoc[]`,
`fetch(id) -> string`) abstracts where corpus text comes from. The production
implementation is an MCP client (`@modelcontextprotocol/sdk`) that connects to a
configured Google Drive MCP server, lists files under a folder, and exports each Doc
as markdown/plain text. A `syncDriveToKnowledge` job runs that source through the
**existing** chunk → embed → upsert pipeline from the
[RAG plan](2026-06-26-ai-rag-knowledge-retrieval.md). Everything is gated by
`VIRLY_DRIVE_SYNC_ENABLED` (default `false`) and the MCP server connection details;
tests use an in-memory `ContentSource` fake and never touch Google or a real MCP
server.

**Tech Stack:** Node ESM + TypeScript, `@modelcontextprotocol/sdk` (MCP client),
the RAG `KnowledgeStore`/`chunkMarkdown`/`EmbeddingClient` (existing), `node:test`.

**Depends on:** the [RAG plan](2026-06-26-ai-rag-knowledge-retrieval.md) (reuses
`chunkMarkdown`, `KnowledgeStore`, `EmbeddingClient`, the registry, and the pgvector
store). Implement RAG first.

## Global Constraints

- ESM: relative imports end in `.js`.
- Server unit tests: `cd server && npm test`. Paths relative to `server/`.
- OFF by default (`VIRLY_DRIVE_SYNC_ENABLED` unset/`false`). No MCP connection, no
  network, no Google credentials needed for the suite to pass.
- The MCP client lives behind the `ContentSource` interface; ALL tests use the fake.
- Synced content is **policy/FAQ/upsell prose only** — it feeds the read-only,
  advisory `searchKnowledgeBase` tool. It NEVER affects numbers, confirmations, or
  the money gate.
- TDD throughout.

## Approach & rationale

Three approaches:

1. **MCP client server-side, behind a `ContentSource` seam (chosen).** Honors the
   TODO's "Google Drive MCP" wording, keeps Google specifics out of the app core,
   and reuses the RAG pipeline wholesale. The MCP server runs as a separate process
   (stdio) or remote (HTTP/SSE) configured by env; the app is just a client.
2. **Direct Google Drive API (service account, `googleapis`).** Fewer moving parts
   but a new heavy dependency and no MCP — contradicts the TODO. Rejected.
3. **Manual export to `corpus/`.** Zero infra; this is effectively the RAG plan's
   default. Kept as the fallback when sync is disabled, not the deliverable here.

A sync job (not live per-query MCP calls) is right: corpus changes are infrequent,
retrieval must be fast, and embeddings should be precomputed. Live MCP-per-turn would
add latency and cost to every policy question.

## File Structure

| File | Responsibility |
|---|---|
| `src/config.ts` (modify) | Add `config.ai.driveSync`: `enabled`, `mcpCommand`/`mcpArgs` or `mcpUrl`, `folderId`, `serverName`. |
| `src/ai/knowledge/contentSource.ts` (create) | `DriveDoc`, `ContentSource` interface; `createInMemoryContentSource(docs)`. |
| `src/ai/knowledge/mcpContentSource.ts` (create) | MCP-client-backed `ContentSource` (connect, list, export). |
| `src/ai/knowledge/syncDrive.ts` (create) | `syncDriveToKnowledge({ source, store, embedder })` — list → fetch → chunk → embed → replace. |
| `src/ai/knowledge/syncDrive.cli.ts` (create) | CLI: `npm run rag:sync-drive`. |
| `server/package.json` (modify) | Add `@modelcontextprotocol/sdk` dep + `rag:sync-drive` script. |
| `.env.example` (modify) | Document the Drive-sync env vars. |
| `docs/ai/architecture.md` (modify) | Note Drive as a corpus source. |

---

## Task 1: Config block for Drive sync

**Files:**
- Modify: `src/config.ts`
- Test: `src/config.driveSync.test.ts`

**Interfaces:**
- Produces: `config.ai.driveSync: { enabled: boolean; transport: "stdio" | "http"; mcpCommand?: string; mcpArgs: string[]; mcpUrl?: string; serverName: string; folderId?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/config.driveSync.test.ts
import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  const mod = await import(`./config.js?ts=${Date.now()}`);
  process.env = prev;
  return mod.config as typeof import("./config.js").config;
}

test("drive sync disabled by default", async () => {
  const config = await loadConfig({ VIRLY_DRIVE_SYNC_ENABLED: undefined });
  assert.equal(config.ai.driveSync.enabled, false);
});

test("stdio transport parses command and args", async () => {
  const config = await loadConfig({
    VIRLY_DRIVE_SYNC_ENABLED: "true",
    VIRLY_DRIVE_MCP_COMMAND: "npx",
    VIRLY_DRIVE_MCP_ARGS: "-y @some/gdrive-mcp",
    VIRLY_DRIVE_FOLDER_ID: "abc123"
  });
  assert.equal(config.ai.driveSync.enabled, true);
  assert.equal(config.ai.driveSync.transport, "stdio");
  assert.equal(config.ai.driveSync.mcpCommand, "npx");
  assert.deepEqual(config.ai.driveSync.mcpArgs, ["-y", "@some/gdrive-mcp"]);
  assert.equal(config.ai.driveSync.folderId, "abc123");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/config.driveSync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the config block**

In `src/config.ts`, inside the `ai` object:

```ts
driveSync: (() => {
  const enabled =
    getStringEnv("VIRLY_DRIVE_SYNC_ENABLED", "false").trim().toLowerCase() === "true";
  const mcpUrl = getStringEnv("VIRLY_DRIVE_MCP_URL", "").trim() || undefined;
  const mcpCommand = getStringEnv("VIRLY_DRIVE_MCP_COMMAND", "").trim() || undefined;
  const mcpArgs = getStringEnv("VIRLY_DRIVE_MCP_ARGS", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    enabled,
    transport: (mcpUrl ? "http" : "stdio") as "stdio" | "http",
    mcpCommand,
    mcpArgs,
    mcpUrl,
    serverName: getStringEnv("VIRLY_DRIVE_MCP_SERVER_NAME", "google-drive").trim(),
    folderId: getStringEnv("VIRLY_DRIVE_FOLDER_ID", "").trim() || undefined
  };
})()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/config.driveSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/config.driveSync.test.ts
git commit -m "feat(ai): config block for Google Drive MCP sync (off by default)"
```

---

## Task 2: ContentSource interface + in-memory fake

**Files:**
- Create: `src/ai/knowledge/contentSource.ts`
- Test: `src/ai/knowledge/contentSource.test.ts`

**Interfaces:**
- Produces:
  - `type DriveDoc = { id: string; name: string; mimeType: string }`
  - `interface ContentSource { list(): Promise<DriveDoc[]>; fetch(id: string): Promise<string>; close(): Promise<void> }`
  - `function createInMemoryContentSource(docs: Array<DriveDoc & { text: string }>): ContentSource`

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/contentSource.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryContentSource } from "./contentSource.js";

test("in-memory source lists and fetches docs", async () => {
  const source = createInMemoryContentSource([
    { id: "1", name: "Fees", mimeType: "text/markdown", text: "# Fees\nNo fee." }
  ]);
  const docs = await source.list();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, "Fees");
  assert.match(await source.fetch("1"), /No fee/);
  await source.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/contentSource.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interface + fake**

```ts
// src/ai/knowledge/contentSource.ts
export type DriveDoc = { id: string; name: string; mimeType: string };

export interface ContentSource {
  list(): Promise<DriveDoc[]>;
  fetch(id: string): Promise<string>;
  close(): Promise<void>;
}

export function createInMemoryContentSource(
  docs: Array<DriveDoc & { text: string }>
): ContentSource {
  const byId = new Map(docs.map((d) => [d.id, d]));
  return {
    async list() {
      return docs.map(({ id, name, mimeType }) => ({ id, name, mimeType }));
    },
    async fetch(id) {
      const doc = byId.get(id);
      if (!doc) {
        throw new Error(`No such doc: ${id}`);
      }
      return doc.text;
    },
    async close() {}
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/contentSource.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/contentSource.ts server/src/ai/knowledge/contentSource.test.ts
git commit -m "feat(ai): ContentSource interface + in-memory fake"
```

---

## Task 3: Sync job (source → knowledge store), source-agnostic

**Files:**
- Create: `src/ai/knowledge/syncDrive.ts`
- Test: `src/ai/knowledge/syncDrive.test.ts`

**Interfaces:**
- Consumes: `ContentSource` (Task 2), `KnowledgeStore` + `EmbeddingClient` + `chunkMarkdown` (RAG plan).
- Produces: `async function syncDriveToKnowledge(input: { source: ContentSource; store: KnowledgeStore; embedder: EmbeddingClient }): Promise<{ docs: number; chunks: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/knowledge/syncDrive.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import type { EmbeddingClient } from "./types.js";
import { createInMemoryKnowledgeStore } from "./inMemoryStore.js";
import { createInMemoryContentSource } from "./contentSource.js";
import { syncDriveToKnowledge } from "./syncDrive.js";

const fakeEmbedder: EmbeddingClient = {
  async embed(texts) {
    return texts.map(() => [1, 0]);
  }
};

test("syncs every doc through the chunk/embed/upsert pipeline", async () => {
  const source = createInMemoryContentSource([
    { id: "1", name: "Fees", mimeType: "text/markdown", text: "# Fees\nNo fee at Virly." },
    { id: "2", name: "FAQ", mimeType: "text/markdown", text: "# FAQ\nQ: limits?\nA: see tools." }
  ]);
  const store = createInMemoryKnowledgeStore(fakeEmbedder);
  const out = await syncDriveToKnowledge({ source, store, embedder: fakeEmbedder });
  assert.equal(out.docs, 2);
  assert.ok(out.chunks >= 2);
  const hits = await store.search("fees", 5);
  assert.ok(hits.some((h) => /No fee/.test(h.text)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/syncDrive.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the sync job**

```ts
// src/ai/knowledge/syncDrive.ts
import { chunkMarkdown } from "./chunk.js";
import type { ContentSource } from "./contentSource.js";
import type { EmbeddingClient, KnowledgeStore } from "./types.js";

export async function syncDriveToKnowledge(input: {
  source: ContentSource;
  store: KnowledgeStore;
  embedder: EmbeddingClient;
}): Promise<{ docs: number; chunks: number }> {
  const docs = await input.source.list();
  let chunkCount = 0;
  for (const doc of docs) {
    const text = await input.source.fetch(doc.id);
    const chunks = chunkMarkdown(text, { source: doc.name });
    if (chunks.length === 0) {
      continue;
    }
    const embeddings = await input.embedder.embed(chunks.map((c) => c.text));
    await input.store.upsertChunks(
      chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }))
    );
    chunkCount += chunks.length;
  }
  return { docs: docs.length, chunks: chunkCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/syncDrive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/syncDrive.ts server/src/ai/knowledge/syncDrive.test.ts
git commit -m "feat(ai): drive-to-knowledge sync job (source-agnostic)"
```

---

## Task 4: MCP-client content source

**Files:**
- Create: `src/ai/knowledge/mcpContentSource.ts`
- Modify: `server/package.json` (add `@modelcontextprotocol/sdk`)
- Test: `src/ai/knowledge/mcpContentSource.test.ts` (unit-tests the response mapping, not a live server)

**Interfaces:**
- Consumes: `ContentSource`/`DriveDoc` (Task 2), `config.ai.driveSync` (Task 1).
- Produces:
  - `function mapListResult(raw: unknown): DriveDoc[]` (exported for the test)
  - `async function createMcpDriveContentSource(cfg: typeof config.ai.driveSync): Promise<ContentSource>`

- [ ] **Step 1: Install the MCP SDK**

```bash
cd server && npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Write the failing test (response mapping, no network)**

```ts
// src/ai/knowledge/mcpContentSource.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { mapListResult } from "./mcpContentSource.js";

test("maps an MCP list/search tool result to DriveDoc[]", () => {
  const raw = {
    content: [
      {
        type: "text",
        text: JSON.stringify([
          { id: "1", name: "Fees", mimeType: "application/vnd.google-apps.document" },
          { id: "2", name: "FAQ", mimeType: "text/markdown" }
        ])
      }
    ]
  };
  const docs = mapListResult(raw);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].id, "1");
  assert.equal(docs[1].name, "FAQ");
});

test("returns [] for an unrecognised shape", () => {
  assert.deepEqual(mapListResult({ nope: true }), []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ai/knowledge/mcpContentSource.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the MCP content source**

> The exact MCP tool names (`search`/`listFolder`, `read_file_content`/`downloadFile`)
> depend on the chosen Drive MCP server. The implementation reads them from config
> with sensible defaults and isolates the JSON parsing in `mapListResult` /
> `extractText` so only those two functions change if the server's schema differs.

```ts
// src/ai/knowledge/mcpContentSource.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { config as Config } from "../../config.js";
import type { ContentSource, DriveDoc } from "./contentSource.js";

type DriveCfg = (typeof Config)["ai"]["driveSync"];

/** Pulls a DriveDoc[] out of an MCP tool result whose text payload is a JSON array. */
export function mapListResult(raw: unknown): DriveDoc[] {
  const content = (raw as { content?: Array<{ type: string; text?: string }> })?.content;
  const textPart = content?.find((c) => c.type === "text")?.text;
  if (!textPart) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      id: String(d.id ?? d.fileId ?? ""),
      name: String(d.name ?? d.title ?? d.id ?? ""),
      mimeType: String(d.mimeType ?? "text/plain")
    }))
    .filter((d) => d.id);
}

function extractText(raw: unknown): string {
  const content = (raw as { content?: Array<{ type: string; text?: string }> })?.content;
  return content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
}

export async function createMcpDriveContentSource(cfg: DriveCfg): Promise<ContentSource> {
  const client = new Client({ name: "virly-rag-sync", version: "1.0.0" });
  const transport =
    cfg.transport === "http" && cfg.mcpUrl
      ? new StreamableHTTPClientTransport(new URL(cfg.mcpUrl))
      : new StdioClientTransport({
          command: cfg.mcpCommand ?? "npx",
          args: cfg.mcpArgs
        });
  await client.connect(transport);

  return {
    async list() {
      const raw = await client.callTool({
        name: "search",
        arguments: cfg.folderId ? { folderId: cfg.folderId } : {}
      });
      return mapListResult(raw);
    },
    async fetch(id) {
      const raw = await client.callTool({
        name: "read_file_content",
        arguments: { fileId: id }
      });
      return extractText(raw);
    },
    async close() {
      await client.close();
    }
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ai/knowledge/mcpContentSource.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/knowledge/mcpContentSource.ts server/package.json server/package-lock.json package-lock.json server/src/ai/knowledge/mcpContentSource.test.ts
git commit -m "feat(ai): MCP-client Google Drive content source"
```

---

## Task 5: Sync CLI + docs

**Files:**
- Create: `src/ai/knowledge/syncDrive.cli.ts`
- Modify: `server/package.json` (add `rag:sync-drive` script)
- Modify: `.env.example`, `docs/ai/architecture.md`

**Interfaces:**
- Consumes: `config.ai.driveSync`, `createMcpDriveContentSource`, `syncDriveToKnowledge`, `createPgVectorStore`, `createOpenAiEmbeddingClient`.

- [ ] **Step 1: Implement the CLI**

```ts
// src/ai/knowledge/syncDrive.cli.ts
import { Pool } from "pg";
import { config } from "../../config.js";
import { createOpenAiEmbeddingClient } from "./embeddings.js";
import { createPgVectorStore } from "./pgvectorStore.js";
import { createMcpDriveContentSource } from "./mcpContentSource.js";
import { syncDriveToKnowledge } from "./syncDrive.js";

async function main() {
  if (!config.ai.driveSync.enabled) {
    throw new Error("Set VIRLY_DRIVE_SYNC_ENABLED=true to sync from Drive.");
  }
  if (!config.ai.rag.postgresUrl) {
    throw new Error("Set VIRLY_RAG_POSTGRES_URL (or VIRLY_POSTGRES_URL).");
  }
  const pool = new Pool({ connectionString: config.ai.rag.postgresUrl });
  const embedder = createOpenAiEmbeddingClient({
    apiKey: config.ai.openAIApiKey,
    model: config.ai.rag.embeddingModel
  });
  const store = createPgVectorStore({ pool, embedder, dimensions: 1536 });
  await store.ensureSchema();
  await pool.query("truncate rag_chunks");
  const source = await createMcpDriveContentSource(config.ai.driveSync);
  try {
    const out = await syncDriveToKnowledge({ source, store, embedder });
    console.log(`Synced ${out.chunks} chunks from ${out.docs} Drive docs.`);
  } finally {
    await source.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `server/package.json` scripts:

```json
"rag:sync-drive": "tsx src/ai/knowledge/syncDrive.cli.ts"
```

- [ ] **Step 2: Add env vars to `.env.example`**

```
# Google Drive MCP corpus sync (optional; off by default)
VIRLY_DRIVE_SYNC_ENABLED=false
VIRLY_DRIVE_MCP_COMMAND=npx
VIRLY_DRIVE_MCP_ARGS=-y @modelcontextprotocol/server-gdrive
VIRLY_DRIVE_MCP_URL=
VIRLY_DRIVE_MCP_SERVER_NAME=google-drive
VIRLY_DRIVE_FOLDER_ID=
```

- [ ] **Step 3: Document in `docs/ai/architecture.md`**

Under the RAG subsection, note that the corpus can be sourced from a Google Drive
folder via `rag:sync-drive` (MCP client) as an alternative to local `corpus/` files;
both feed the same `KnowledgeStore`.

- [ ] **Step 4: Run the full suite**

Run: `cd server && npm test`
Expected: PASS — Drive sync off by default; only the new unit tests run.

- [ ] **Step 5: Commit**

```bash
git add server/src/ai/knowledge/syncDrive.cli.ts server/package.json .env.example docs/ai/architecture.md
git commit -m "feat(ai): rag:sync-drive CLI + docs for Drive MCP corpus source"
```

---

## Self-Review

- **Spec coverage:** config gate (T1), source abstraction (T2), source-agnostic sync
  reusing the RAG pipeline (T3), MCP client (T4), CLI + docs (T5). "Google Drive MCP
  for upsell or policy" is covered, scoped to corpus population.
- **Placeholder scan:** none — the only intentional flex point (MCP tool names) is
  isolated to `mapListResult`/`extractText` and called out explicitly.
- **Type consistency:** `ContentSource.list/fetch/close`, `DriveDoc`, and the RAG
  `KnowledgeStore`/`EmbeddingClient` signatures are used identically across sync, MCP
  source, and CLI.

## Open questions (answer later)

1. **Which Drive MCP server?** Official `@modelcontextprotocol/server-gdrive`, the
   workspace's existing `google-drive` MCP, or a custom one? Its tool names/auth
   shape determine `mapListResult`/`fetch`.
2. **Auth** — service-account credentials vs OAuth? Where do they live (the MCP
   server owns auth, but it needs configuring)?
3. **Upsell vs policy separation** — same folder/store, or tag docs so upsell snippets
   are only used on sales-appropriate turns?
4. **Sync cadence** — manual CLI only (this plan), or a scheduled job? (A cron/worker
   is a natural follow-up but out of scope here.)
