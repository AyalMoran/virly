# Reversible MongoDB → PostgreSQL Migration (Phase 2) — Design Spec

**Status:** Draft — ready for implementation planning
**Date:** 2026-06-25
**Author:** brainstormed with the team
**Scope:** `server/src/ai/v2/memory/` only (the LangGraph v2 checkpointer and
long-term store). Application repositories and the client are unaffected.

---

## Goal (hand this to the implementing agent)

> Make the v2 AI agent's thread-memory (checkpointer) and long-term-memory (store)
> run on **either MongoDB or PostgreSQL**, governed by the same `VIRLY_DB_DRIVER`
> boot flag introduced in Phase 1. With `VIRLY_DB_DRIVER=postgres` the application
> must **not need a Mongo connection at all** — no `VIRLY_MONGODB_URI` required,
> no Mongoose connection opened, no `@langchain/langgraph-checkpoint-mongodb` import
> active. **A trivial transition back to MongoDB** must remain possible (flip the
> flag; no code changes). Phase 1 (see [Phase 1 spec](2026-06-22-postgres-migration-design.md))
> deliberately left the LangGraph persistence on Mongo as a "Phase-1 hybrid";
> Phase 2 removes that last Mongo dependency.

**Definition of done for Phase 2:**
1. With `VIRLY_DB_DRIVER=mongo` (the default) the app behaves exactly as it does
   after Phase 1; the full existing test suite and v2 conformance suite pass.
2. With `VIRLY_DB_DRIVER=postgres` the LangGraph checkpointer and long-term store
   are backed by Postgres; the app opens **no** Mongoose connection and requires
   **no** `VIRLY_MONGODB_URI`.
3. The v2 conformance suite (`server/src/ai/evals/v2/v2-conformance.test.ts`) and
   persona-tone suite pass unchanged in both modes (the suites are DB-free and must
   continue to be so).
4. A one-time thread/memory migration script or a justified "fresh start" policy is
   in place and documented.
5. A reverse path from Postgres back to Mongo exists (mirror the Phase 1 model:
   flip the flag, optionally run a sync script).
6. No file imports `@langchain/langgraph-checkpoint-mongodb` when running in Postgres
   mode (static import eliminated from the hot path; the package itself may still be
   present in `node_modules` during a transition window but must not be a runtime
   requirement).

---

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Reversibility model | **Same `VIRLY_DB_DRIVER` flag as Phase 1** | One flag, one DB live; consistent with the Phase 1 pattern. Revert = flip flag (+ optional reverse sync). No dual-write complexity. |
| Phase 2 scope | **v2 LangGraph checkpointer + store only** | All application repositories are already on Postgres (Phase 1). This is the single remaining Mongo dependency. |
| Checkpointer/store library | **`@langchain/langgraph-checkpoint-postgres`** (new dependency; not yet in `package.json`) | Official LangGraph-maintained Postgres adapter; provides `PostgresSaver` (checkpointer) and `PostgresStore` (long-term store), the exact counterparts to the Mongo classes being replaced. Keeps the replacement surgically local to `ai/v2/memory/`. |
| Thread-id mapping | **`conversationId` unchanged** | LangGraph's `thread_id` is already set to `conversationId` in Phase 1. No rename needed; Postgres tables key on the same value. |
| JSON serialization parity | **Library handles it; `JSONB` column type** | `@langchain/langgraph-checkpoint-postgres` uses `JSONB` for checkpoint payloads, matching the Phase 1 pattern for all other embedded objects. Serialization is the library's responsibility; any drift would be a library bug, not an app bug. |
| Schema migration strategy | **Library's built-in migrator (`PostgresSaver.setup()` / `PostgresStore.setup()`)** (see §4 for trade-off discussion) | The LangGraph tables have complex, versioned internal schemas that the library's own migrator keeps in sync. Drizzle migrations would need to replicate and track library internals — fragile. |
| Data migration policy | **Fresh start for thread checkpoints; optional script for long-term memory** | Thread checkpoints are ephemeral conversation state with natural TTL; silently losing them causes no data loss of record. Long-term memory (counterparties, preferences, facts) is durable user state and deserves a migration path (§8). |

---

## 1. Architecture — the Phase-1 hybrid and what Phase 2 changes

For context on the overall data-access seam introduced in Phase 1, see
[§1 of the Phase 1 spec](2026-06-22-postgres-migration-design.md) and the
[driver plan](../plans/2026-06-23-postgres-migration-driver.md).

After Phase 1 the boot sequence is:

```
bootstrap()
  └─ connectDb()          ← always opens mongoose.connect() — even in Postgres mode
  └─ initRepositories()   ← Drizzle pool when postgres; Mongoose models when mongo
```

`connectDb()` in `server/src/db.ts:8` unconditionally calls `mongoose.connect(config.mongoUri)`.
In `server/src/index.ts:8` `connectDb()` is called first, so Mongo is always live.
The LangGraph memory layer in `server/src/ai/v2/memory/loop.ts:28-29` then checks
`mongoose.connection.readyState` and calls `mongoose.connection.getClient()` to pass a
live `MongoClient` to `createMongoLongTermStore`.

Phase 2 breaks that unconditional connection. After Phase 2:

```
bootstrap()
  └─ connectDb()
       ├─ if dbDriver === "mongo"  → mongoose.connect()   (as today)
       └─ if dbDriver === "postgres" → (no mongoose.connect; PG pool already open)
  └─ initRepositories()            (unchanged)
  └─ initLangGraphMemory()         ← NEW: wires checkpointer + store from dbDriver
```

The LangGraph memory layer picks its backing store from `config.dbDriver`, not from
the live state of `mongoose.connection`.

See [§6 of the Phase 1 spec](2026-06-22-postgres-migration-design.md) for the
description of the hybrid that Phase 2 removes, and [§13](2026-06-22-postgres-migration-design.md)
for the explicit out-of-scope handoff.

For an overview of the v2 agent memory design (what the checkpointer and store do,
the rolling-summary loop, and the `LongTermMemorySnapshot` type), see the
[AI architecture doc — v2 memory section](../../ai/architecture.md).

---

## 2. Current state (verified — cite file:line)

All facts below were verified by reading the source directly.

**`@langchain/langgraph-checkpoint-mongodb` imports (to be removed in Postgres mode):**
- `server/src/ai/v2/memory/checkpointer.ts:16` — `import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb"`
- `server/src/ai/v2/memory/store.ts:15` — `import { MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb"`

**`@langchain/langgraph-checkpoint-mongodb` is a current `package.json` dependency** at
`^1.3.4`. `@langchain/langgraph-checkpoint-postgres` is **not** yet present.

**Always-connect-Mongo boot path (to be made conditional):**
- `server/src/db.ts:8` — `await mongoose.connect(config.mongoUri)` — unconditional;
  no `dbDriver` guard.
- `server/src/index.ts:8` — `await connectDb()` — called on every boot regardless
  of `VIRLY_DB_DRIVER`.

**LangGraph memory glue that reads from `mongoose.connection`:**
- `server/src/ai/v2/memory/loop.ts:29` — `mongoose.connection.getClient()` — this
  is the line that acquires the `MongoClient` and passes it to `createMongoLongTermStore`
  (guarded by the `readyState === 1` check on `loop.ts:28`).
  The cached `resolveLongTermStore()` function (loop.ts:22–35) also inspects
  `mongoose.connection.readyState === 1`, which means if Mongo is not connected the
  store degrades to `undefined` (in-memory fallback). Phase 2 replaces this
  resolution logic with a driver-aware factory.

**Interface the agent depends on (will not change):**
- `server/src/ai/v2/memory/store.ts` — `BaseStore` (from `@langchain/langgraph`) with
  `get`, `put`, `search` — used by `readLongTermSnapshot`, `upsertCounterparty`,
  `upsertPreferences`, `rememberFact`.
- `server/src/ai/v2/memory/checkpointer.ts` — `BaseCheckpointSaver` (from `@langchain/langgraph`) —
  passed to the graph constructor; the graph never cares about the concrete class.

**v2 eval harness:** `server/src/ai/evals/v2/` — DB-free by design (harness.ts:10:
"DB-free fakes"). The harness uses in-memory stores and will not be affected by the
swap.

---

## 3. Design — the checkpointer/store swap

The swap is **local to `server/src/ai/v2/memory/`**. No other files change except
`db.ts` (make Mongoose conditional) and `index.ts` / wherever the memory layer is
wired to boot.

### 3.1 New factory functions

`checkpointer.ts` grows a `createPostgresCheckpointer`:

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { Pool } from "pg";

export async function createPostgresCheckpointer(
  pool: Pool
): Promise<BaseCheckpointSaver> {
  const saver = PostgresSaver.fromConnString(/* or from pool */);
  await saver.setup();          // idempotent: runs the library's own DDL
  return saver;
}
```

`store.ts` grows a `createPostgresLongTermStore`:

```ts
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres";
import type { Pool } from "pg";

export async function createPostgresLongTermStore(
  pool: Pool
): Promise<BaseStore> {
  const store = PostgresStore.fromConnString(/* or from pool */);
  await store.setup();          // idempotent DDL
  return store;
}
```

Both return the same `BaseCheckpointSaver` / `BaseStore` interfaces already consumed
by the graph and the memory-glue functions (`readLongTermSnapshot`, `upsertCounterparty`,
etc.). **No consumer changes.**

### 3.2 Driver-aware resolution (`loop.ts`)

`resolveLongTermStore()` currently reads `mongoose.connection.readyState`. Replace
with a boot-time singleton pattern driven by `config.dbDriver`:

```ts
// loop.ts — after Phase 2
let cachedStore: BaseStore | undefined;
let storeResolved = false;

export async function initLongTermStore(): Promise<void> {
  if (config.dbDriver === "postgres") {
    cachedStore = await createPostgresLongTermStore(getPgDb());
  } else {
    // mongo mode: keep existing mongoose.connection path
    cachedStore = createMongoLongTermStore(mongoose.connection.getClient());
  }
  storeResolved = true;
}

export function resolveLongTermStore(): BaseStore | undefined {
  return cachedStore;
}
```

`initLongTermStore()` is called from the boot sequence after `connectDb()` and
`initRepositories()`.

### 3.3 Checkpointer wiring

`createCheckpointer()` in `checkpointer.ts` similarly becomes driver-aware:

```ts
export async function createCheckpointer(
  options: CheckpointerOptions = {}
): Promise<BaseCheckpointSaver> {
  if (config.dbDriver === "postgres") {
    return createPostgresCheckpointer(getPgDb());
  }
  if (options.client) {
    return createMongoCheckpointer(options.client, options.dbName);
  }
  return createInMemoryCheckpointer();
}
```

The graph builder (wherever it calls `createCheckpointer`) must `await` the result
(it is already async in the v2 graph initialisation path).

---

## 4. Schema / migration plan for LangGraph tables

### Library migrator vs Drizzle — trade-off

| Approach | Pros | Cons |
|---|---|---|
| **Library's built-in migrator** (`PostgresSaver.setup()` / `PostgresStore.setup()`) | Zero maintenance: library upgrades bring their own DDL; tables stay consistent with the library internals; no risk of schema drift. | DDL runs at boot (tiny, idempotent); not tracked in Drizzle's migration history; DBA visibility requires reading library source. |
| **Drizzle migrations** | All DDL in one place; DBA-visible; tracked in `drizzle/`; rollback via Drizzle snapshots. | Must replicate and track complex library-internal schemas; fragile on library upgrades; high maintenance cost. |

**Decision: library migrator.** The LangGraph tables are internal to the library —
the app never queries them directly, only through the `BaseCheckpointSaver` /
`BaseStore` interface. Replicating the schema in Drizzle would couple us to library
internals. Calling `setup()` once at boot (it is idempotent) is safe and mirrors the
standard usage pattern of both `@langchain/langgraph-checkpoint-postgres` and
`@langchain/langgraph-checkpoint-mongodb` (which calls `checkpointer.setup()` in its
own examples).

**What `setup()` creates (as of current library versions):**
- `checkpoints` — one row per `(thread_id, checkpoint_ns, checkpoint_id)`.
- `checkpoint_writes` — pending writes not yet folded into a checkpoint.
- `checkpoint_blobs` — binary/large payload storage.
- `store` — one row per `(namespace[], key)` for the long-term store.

All tables live under a configurable prefix (default: none). Phase 2 uses the
defaults to stay aligned with standard library examples.

---

## 5. Boot changes — making Mongoose conditional

**Current** (`server/src/db.ts`):

```ts
export async function connectDb() {
  await mongoose.connect(config.mongoUri);           // line 8 — unconditional
  console.log(`MongoDB connected: ${config.mongoUri}`);
}
```

**After Phase 2:**

```ts
export async function connectDb() {
  if (config.dbDriver === "mongo") {
    await mongoose.connect(config.mongoUri);
    console.log(`MongoDB connected: ${config.mongoUri}`);
  }
  // postgres mode: no Mongoose connection; PG pool is opened in initRepositories()
}
```

**`config.ts`** — `VIRLY_MONGODB_URI` currently has a hardcoded default and is always
read. In Postgres mode it is no longer required. The fail-fast guard becomes:

```ts
if (dbDriver === "mongo" && !mongoUri) {
  throw new Error("VIRLY_MONGODB_URI is required when VIRLY_DB_DRIVER=mongo.");
}
```

(Today the field has a localhost default so it never actually throws; Phase 2 does
not need to change this beyond ensuring Postgres mode doesn't open a connection to
the default URI.)

**`server/src/index.ts`** — add `initLongTermStore()` to the boot sequence:

```ts
async function bootstrap() {
  await connectDb();
  await initRepositories();
  await initLangGraphMemory();       // new: wires checkpointer + store
  if (config.dbDriver === "postgres") startTtlSweeper();
  startDailyFxRefresh();
  app.listen(config.port, () => { … });
}
```

**Environment variables after Phase 2:**

| Var | Default | Meaning |
|---|---|---|
| `VIRLY_DB_DRIVER` | `mongo` | `mongo` or `postgres`; selects the live database at boot. |
| `VIRLY_POSTGRES_URL` | — | Required when `VIRLY_DB_DRIVER=postgres`. |
| `VIRLY_MONGODB_URI` | `mongodb://127.0.0.1:27017/virly` | Required when `VIRLY_DB_DRIVER=mongo` only. Not consulted in Postgres mode. |

---

## 6. File structure

Only `server/src/ai/v2/memory/` and the boot files change. No new top-level
directories.

```
server/
  package.json                         # + @langchain/langgraph-checkpoint-postgres
  src/
    config.ts                          # VIRLY_MONGODB_URI guard: only required in mongo mode
    db.ts                              # connectDb: mongoose.connect conditional on dbDriver
    index.ts                           # + await initLangGraphMemory()
    ai/
      v2/
        memory/
          checkpointer.ts              # + createPostgresCheckpointer(); createCheckpointer() async + driver-aware
          store.ts                     # + createPostgresLongTermStore()
          loop.ts                      # initLongTermStore(); resolveLongTermStore() no longer reads mongoose.connection
          types.ts                     # unchanged
          summary.ts                   # unchanged
```

---

## 7. Data migration + reversibility

### Thread checkpoints — fresh start

Thread checkpoints are live conversation state. A checkpoint encodes the in-flight
message list for an interrupted or multi-turn conversation. They expire naturally when
a conversation ends (or the user starts a new one). Migrating them from Mongo to
Postgres is possible in principle but adds significant complexity for negligible user
benefit — a user mid-conversation during the cutover simply restarts the thread.

**Decision:** fresh start for thread checkpoints. Existing `ai_v2_checkpoints` and
`ai_v2_checkpoint_writes` collections in Mongo are left untouched (they will be
ignored in Postgres mode and will eventually be dropped when the Mongo instance is
decommissioned).

### Long-term memory — migration script

Long-term memory (`UserPreferences`, `CounterpartyRecord`, `SalientFact`) is
durable user state accumulated over many conversations. Losing it degrades the
assistant's recall. A migration script is warranted.

**`server/scripts/sync-langgraph-memory-mongo-to-postgres.ts`:**

1. Connect both Mongo (`mongoose`) and Postgres (`pg` pool with same URL as
   `VIRLY_POSTGRES_URL`).
2. Run `PostgresStore.setup()` so the `store` table exists.
3. Read all documents from the `ai_v2_memory` collection (field schema matches
   `LongTermMemorySnapshot` structure keyed by `userNamespace(userId)`).
4. For each document, call `postgresStore.put(namespace, key, value)`. The namespace
   and key formats are identical (`["virly", "users", userId]` / `"preferences"` /
   `"counterparty:…"` / `"fact:…"`) because the Mongo and Postgres stores share the
   same namespacing convention from `store.ts`.
5. Log count of migrated items; exit non-zero on any error.

**Idempotency:** `put` is an upsert by `(namespace, key)`; safe to re-run.

**Reverse script (`sync-langgraph-memory-postgres-to-mongo.ts`):** reads the
`store` table via `PostgresStore.search()` for all items, then calls
`MongoDBStore.put()` for each — the reverse direction.

### Rollback procedure

Phase 2 follows the Phase 1 flip-the-flag model exactly:

**Forward (Mongo → Postgres):**
1. Add `VIRLY_POSTGRES_URL`. Run `npm run db:migrate` (Drizzle migrations, unchanged
   from Phase 1).
2. Run `sync-langgraph-memory-mongo-to-postgres.ts`. Verify row counts match.
3. Set `VIRLY_DB_DRIVER=postgres`; remove `VIRLY_MONGODB_URI` from production env.
   Restart. `PostgresSaver.setup()` + `PostgresStore.setup()` run at boot.

**Rollback (Postgres → Mongo):**
1. (Optional) Run `sync-langgraph-memory-postgres-to-mongo.ts` to sync any new
   long-term memory written since cutover.
2. Set `VIRLY_DB_DRIVER=mongo`; restore `VIRLY_MONGODB_URI`. Restart.
3. Thread checkpoints: new conversations start clean (as on forward cutover).

No code changes required for either direction.

---

## 8. Testing strategy

### Existing suites (must stay green — no changes expected)

- **v2 conformance suite** (`server/src/ai/evals/v2/v2-conformance.test.ts`) — DB-free
  by design; uses in-memory checkpointer and store. Phase 2 does not touch the harness
  or the in-memory factories. Suite must pass in both `VIRLY_DB_DRIVER` modes.
- **Persona-tone suite** (`server/src/ai/evals/v2/persona-tone.test.ts`) — also DB-free.
  Same guarantee.
- **Repository contract suite** (Phase 1 addition) — covers the 9 app repositories;
  unaffected by Phase 2.

### New: LangGraph memory contract suite

Add `server/tests/memory/langgraph-memory.contract.test.ts` (driver-parametrised,
like the repository contract suite):

| Test | Assertion |
|---|---|
| `checkpointer: put → get round-trip` | A checkpoint saved under `thread_id=T` is retrievable with the same payload. |
| `checkpointer: list returns checkpoints in order` | After N puts, `list()` returns N entries, newest first. |
| `store: put → get round-trip` | Item saved under `(namespace, key)` is retrievable with the same `value`. |
| `store: search returns all items in namespace` | After multiple `put` calls, `search(namespace)` returns all of them. |
| `store: preferences merge` | `upsertPreferences` (uses `put` + `get`) merges fields correctly. |
| `store: counterparty upsert merges relation` | `sent_to` + `received_from` → `both`. |

The suite is run against a real Postgres (`VIRLY_POSTGRES_URL` set; `setup()` called
before each test; tables truncated between tests). A `docker-compose` test-profile
service for Postgres already exists from Phase 1.

The existing in-memory tests for `readLongTermSnapshot`, `upsertCounterparty`, etc.
(`store.ts` unit tests if any exist; otherwise they are implicit in the conformance
suite) continue to run without a real DB.

### Eval regression check

The v2 conformance suite uses in-memory stubs and does not exercise the real
checkpointer or store. To catch serialization regressions in the Postgres backend,
the memory contract suite above is the primary signal. No change to the eval harness
itself is required.

---

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Serialization drift** — checkpoint payload serialized by `PostgresSaver` differs subtly from `MongoDBSaver`, breaking resume of existing threads | Low (fresh start for checkpoints; library manages its own schema) | Fresh-start policy eliminates the migration surface. Contract suite asserts round-trip fidelity for new Postgres-only threads. |
| **Summarization-loop behaviour changes** — `foldRollingSummary` in `summary.ts` relies on the full message list from the checkpointer; if checkpointer returns messages in different order/encoding, summaries drift | Low (library preserves insertion order; message serialization is standard LangGraph) | Contract suite asserts insertion-order fidelity. Run one end-to-end multi-turn conversation against Postgres in staging and compare summary output. |
| **`PostgresStore` namespace format incompatibility** — `["virly", "users", userId]` namespace passed to `search()` behaves differently in Postgres vs Mongo | Low (both libraries implement the same `BaseStore` interface) | Memory contract suite exercises `search(namespace)` explicitly. |
| **`setup()` DDL races at boot** — two server instances starting simultaneously both call `setup()` | Low (`setup()` is defined as idempotent by the library; uses `CREATE TABLE IF NOT EXISTS`) | No action required; idempotency is the library's contract. |
| **`@langchain/langgraph-checkpoint-postgres` API surface changes** — the package is relatively new; `PostgresSaver`/`PostgresStore` constructor signature may change on minor bumps | Medium | Pin to a specific minor version; read the changelog on each upgrade before bumping. |
| **Mongo decommission mistimed** — Mongo is removed before the long-term memory migration script is run | Medium (operational risk) | Runbook in §7 makes the migration step explicit and before env-var removal. Make `VIRLY_MONGODB_URI` absence a warning (not a crash) in Postgres mode to avoid accidental boot failure. |
| **Long-term memory data volume** — `ai_v2_memory` grows over time; `search(namespace, { limit: 200 })` in `store.ts:84` may be insufficient | Low (current limit matches both drivers; 200 items per user is generous for personal memory) | No change. Flag for future review if memory scales. |

---

## 10. Out of scope

- `numeric` money-type hardening and `SERIALIZABLE`/row-lock concurrency tightening
  (Phase 1 §13, still out of scope).
- v1 AI graph teardown.
- Decommissioning the Mongo instance (operational; not a code change; follows after
  Phase 2 is verified stable in production).
- Adding `VIRLY_MONGODB_URI` validation failure in Postgres mode — the existing
  localhost default means the config does not fail fast; this is acceptable (the
  connection is simply never opened in Postgres mode).

---

## 11. Cutover & rollback runbook

**Forward (Mongo → Postgres, full stack including Phase 2):**
1. Provision Postgres (if not already done from Phase 1); set `VIRLY_POSTGRES_URL`.
2. Ensure `npm run db:migrate` (Drizzle) has been run — creates Phase 1 app tables.
3. Run `sync-langgraph-memory-mongo-to-postgres.ts` — migrates long-term memory.
4. Verify: item count in Postgres `store` table matches `ai_v2_memory` document count.
5. Set `VIRLY_DB_DRIVER=postgres`; restart. `PostgresSaver.setup()` + `PostgresStore.setup()`
   run at boot (idempotent DDL). Mongo connection is not opened.

**Rollback (Postgres → Mongo):**
1. (Optional) Run `sync-langgraph-memory-postgres-to-mongo.ts`.
2. Set `VIRLY_DB_DRIVER=mongo`; restore `VIRLY_MONGODB_URI`; restart.

---

## 12. Risks & mitigations (summary table — mirrors Phase 1 §14)

See §9 for the full risk table with likelihoods. The top risks are:

- **Serialization drift** — mitigated by fresh-start for checkpoints + contract suite.
- **`setup()` DDL races** — mitigated by library idempotency guarantee.
- **Library API changes** — mitigated by minor-version pinning.
- **Mongo decommission mistimed** — mitigated by explicit runbook ordering.

---

*Spec status: ready for implementation planning.*
