# Scheduled Idempotent RAG Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing `rag:sync --source=drive` job automatically every 6 hours from inside the server process, skipping overlapping runs and emailing an alert when a run fails.

**Architecture:** The job already exists as a CLI (`server/scripts/sync-knowledge-base.ts`) and is already idempotent (it skips documents whose revision is unchanged).
We extract its orchestration into a reusable `src/` module, then add an in-process scheduler that mirrors the existing `startDailyFxRefresh` / `startTtlSweeper` precedent (a `setInterval` started from `index.ts`, unref'd).
Mutual exclusion ("skip if a sync is already running") uses a Postgres session-level advisory lock on the AI pool the sync already connects to - no new infrastructure.
Failure alerting reuses the existing Resend email integration.
The scheduler never passes `--force`, because the sync is already idempotent; `--force` stays reserved for deliberate full re-embeds.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), Node 22, `tsx` for scripts, Drizzle ORM + `pg` over a pgvector Postgres, `@langchain/openai` embeddings, Resend email, Jest (native ESM via `@swc/jest`).

## Global Constraints

These apply to every task. Copied from the codebase conventions and the source Todoist task.

- Node 22; ESM only. Source imports use NodeNext `.js` specifiers (e.g. `import { config } from "../config.js"`) even though the files are `.ts`.
- Config is read only through `getStringEnv` / `getOptionalStringEnv` / `getIntEnv` / `getBooleanEnv` from `server/src/utils/env.ts`. Every new env var is `VIRLY_`-prefixed and added to `server/.env.example`.
- Logging is plain `console.log` / `console.error`, prefixed with a bracketed tag for grep-ability (e.g. `[rag-sync]`). There is no structured logger; do not add one.
- Tests are Jest, live in `__tests__/` dirs under `server/src/`, named `*.test.ts`, and run with `npm test` (which sets `NODE_OPTIONS=--experimental-vm-modules`). The contract config (`jest.contract.config.mjs`) roots at `tests/contract/` and is out of scope here.
- The injectable-dependency style is the house pattern for testability (see `syncKnowledgeBase(source, { repository, embed })`). New runtime logic that touches a DB / network takes its collaborators as injectable options that default to the real ones.
- The scheduled sync MUST run `--source=drive` and MUST NOT pass `--force`. `--force` is reserved for deliberate one-off full re-embeds (e.g. when changing `VIRLY_RAG_EMBEDDING_MODEL` or the 1536 embedding dimensions).
- Do NOT shrink the poll interval to chase freshness. If near-real-time freshness is ever required, switch to a Google Drive push webhook (the `polling-for-real-time` antipattern). The interval has a hard 5-minute floor to enforce this.
- Never write em dashes in prose or docs; use a plain `-`.

---

## File Structure

**Created**

- `server/src/ai/rag/sync-runner.ts` - Reusable, source-building + orchestration core extracted from the CLI script. One responsibility: "given a source kind + options, build the source and run the sync, returning a summary." Imported by both the CLI script and the scheduler (DRY).
- `server/src/ai/rag/__tests__/sync-runner.test.ts` - Unit tests for the source-building guards (no DB / network).
- `server/src/ai/rag/sync-scheduler.ts` - The in-process scheduler: one run (`runScheduledRagSync`) and the timer wiring (`startRagSyncScheduler`). Owns the advisory-lock-then-sync-then-alert flow.
- `server/src/ai/rag/__tests__/sync-scheduler.test.ts` - Unit tests for a single scheduled run, with the lock / runner / alert injected as fakes.

**Modified**

- `server/scripts/sync-knowledge-base.ts` - Refactored to delegate to `sync-runner.ts`; keeps its CLI flag parsing, pool cleanup, and `process.exit` codes. Behavior is identical.
- `server/src/db/vector.ts` - Add `tryAcquireAiAdvisoryLock(key)` returning a release function or `null`. It owns the AI pool, so the advisory-lock client is checked out here.
- `server/src/services/email.service.ts` - Add `sendOpsAlertEmailWithSender(...)` (injectable, testable) and `sendOpsAlertEmail(subject, text)` (reads config + Resend).
- `server/src/config.ts` - Add a `rag.sync` block: `enabled`, `intervalMs` (default 6h, 5-min floor), `alertEmail`.
- `server/src/index.ts` - Call `startRagSyncScheduler()` at boot, next to `startDailyFxRefresh()`.
- `server/.env.example` - Document `VIRLY_RAG_SYNC_ENABLED`, `VIRLY_RAG_SYNC_INTERVAL_MS`, `VIRLY_RAG_SYNC_ALERT_EMAIL`.
- `docs/operations.md` - Add a "Scheduled sync (in-process)" subsection under §5.2.

---

## Task 1: Extract a reusable knowledge-sync runner and refactor the CLI onto it

This pulls the source-building and orchestration out of the one-off CLI script into a `src/` module that the scheduler can call directly, instead of shelling out to `npm run`.
The CLI keeps its exact behavior and output.

**Files:**
- Create: `server/src/ai/rag/sync-runner.ts`
- Create: `server/src/ai/rag/__tests__/sync-runner.test.ts`
- Modify: `server/scripts/sync-knowledge-base.ts` (replace the whole file, lines 1-105)

**Interfaces:**
- Consumes (already exists): `syncKnowledgeBase(source, options): Promise<SyncSummary>` and `type SyncSummary` from `../ingest.js`; `createLocalSource(dir, category?)` from `./sources/local.js`; `createDriveSource(folderId, client, opts)` from `./sources/drive.js`; `createGoogleDriveClient()` from `./sources/driveClient.js`; `runAiMigrations()` from `../../db/vector.js`; `isEmbeddingsConfigured()` from `./embeddings.js`; `config.rag.*` from `../../config.js`.
- Produces (later tasks rely on these exact names/types):
  - `type KnowledgeSourceKind = "drive" | "local"`
  - `buildKnowledgeSource(opts: BuildSourceOptions): Promise<{ source: KnowledgeSource; label: string }>`
  - `runKnowledgeSync(opts: RunKnowledgeSyncOptions): Promise<{ summary: SyncSummary; label: string }>`
  - `type RunKnowledgeSyncOptions = { kind: KnowledgeSourceKind; category?: string; folderId?: string; dir?: string; force?: boolean; dryRun?: boolean; log?: (m: string) => void; onStart?: (info: { label: string; dryRun: boolean }) => void }`

- [ ] **Step 1: Write the failing test**

Create `server/src/ai/rag/__tests__/sync-runner.test.ts`. These tests cover the pure guard paths in `buildKnowledgeSource` (the only branches that do not need a DB / Drive credentials). They mutate-and-restore `config.rag` so they are deterministic regardless of the developer's env, following the config-mutation pattern already used in the email tests.

```ts
import { config } from "../../../config.js";
import { buildKnowledgeSource, type KnowledgeSourceKind } from "../sync-runner.js";

describe("buildKnowledgeSource", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
  });

  function setLocalDir(value: string | undefined) {
    const original = config.rag.localDir;
    config.rag.localDir = value;
    cleanups.push(() => {
      config.rag.localDir = original;
    });
  }

  function setDriveFolderId(value: string | undefined) {
    const original = config.rag.drive.folderId;
    config.rag.drive.folderId = value;
    cleanups.push(() => {
      config.rag.drive.folderId = original;
    });
  }

  test("local source without a dir throws a helpful error", async () => {
    setLocalDir(undefined);
    await expect(buildKnowledgeSource({ kind: "local" })).rejects.toThrow(
      /VIRLY_RAG_LOCAL_DIR/
    );
  });

  test("drive source without a folder id throws a helpful error", async () => {
    setDriveFolderId(undefined);
    await expect(buildKnowledgeSource({ kind: "drive" })).rejects.toThrow(
      /VIRLY_RAG_DRIVE_FOLDER_ID/
    );
  });

  test("an unknown source kind throws", async () => {
    await expect(
      buildKnowledgeSource({ kind: "bogus" as KnowledgeSourceKind })
    ).rejects.toThrow(/Unknown source kind=bogus/);
  });

  test("a local dir argument resolves to an absolute path label", async () => {
    const { label } = await buildKnowledgeSource({ kind: "local", dir: "some/rel/dir" });
    expect(label).toMatch(/^local dir=\//); // path.resolve made it absolute
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `npm test -- src/ai/rag/__tests__/sync-runner.test.ts`
Expected: FAIL - `Cannot find module '../sync-runner.js'` (the module does not exist yet).

- [ ] **Step 3: Write the runner module**

Create `server/src/ai/rag/sync-runner.ts`:

```ts
/**
 * Reusable knowledge-base sync core (extracted from scripts/sync-knowledge-base.ts).
 *
 * `buildKnowledgeSource` resolves a source (Drive or local) from options +
 * config; `runKnowledgeSync` adds the config guards, migrations, and the
 * `syncKnowledgeBase` orchestration. Both the CLI script and the in-process
 * scheduler call these so the source-resolution logic lives in exactly one place.
 *
 * Note: callers own pool lifecycle. The CLI closes the AI pool and exits; the
 * long-lived server scheduler keeps it open. So nothing here calls closeAiPool().
 */
import path from "node:path";

import { config } from "../../config.js";
import { runAiMigrations } from "../../db/vector.js";
import { isEmbeddingsConfigured } from "./embeddings.js";
import { syncKnowledgeBase, type SyncSummary } from "./ingest.js";
import { createLocalSource } from "./sources/local.js";
import { createDriveSource } from "./sources/drive.js";
import type { KnowledgeSource } from "./sources/types.js";

export type KnowledgeSourceKind = "drive" | "local";

export type BuildSourceOptions = {
  kind: KnowledgeSourceKind;
  category?: string;
  /** Drive: overrides VIRLY_RAG_DRIVE_FOLDER_ID. */
  folderId?: string;
  /** Local: overrides VIRLY_RAG_LOCAL_DIR. */
  dir?: string;
  log?: (message: string) => void;
};

export async function buildKnowledgeSource(
  opts: BuildSourceOptions
): Promise<{ source: KnowledgeSource; label: string }> {
  const log = opts.log ?? (() => {});

  if (opts.kind === "local") {
    const dirArg = opts.dir ?? config.rag.localDir;
    if (!dirArg) {
      throw new Error("Local source needs --dir=<path> or VIRLY_RAG_LOCAL_DIR.");
    }
    const dir = path.resolve(dirArg);
    return { source: createLocalSource(dir, opts.category), label: `local dir=${dir}` };
  }

  if (opts.kind === "drive") {
    const folderId = opts.folderId ?? config.rag.drive.folderId;
    if (!folderId) {
      throw new Error("Drive source needs --folder=<id> or VIRLY_RAG_DRIVE_FOLDER_ID.");
    }
    // Import the googleapis-backed client lazily so the SDK loads only for Drive.
    const { createGoogleDriveClient } = await import("./sources/driveClient.js");
    const client = createGoogleDriveClient();
    const source = createDriveSource(folderId, client, {
      categoryOverride: opts.category,
      onSkip: (file, reason) => log(`~ skip   ${file.name} (${reason})`)
    });
    return { source, label: `drive folder=${folderId}` };
  }

  throw new Error(`Unknown source kind=${opts.kind}. Use 'drive' or 'local'.`);
}

export type RunKnowledgeSyncOptions = {
  kind: KnowledgeSourceKind;
  category?: string;
  folderId?: string;
  dir?: string;
  /** Re-embed even unchanged files. The scheduler always leaves this false. */
  force?: boolean;
  dryRun?: boolean;
  /** Per-file progress sink. */
  log?: (message: string) => void;
  /** Called once after the source resolves, before syncing (for a header line). */
  onStart?: (info: { label: string; dryRun: boolean }) => void;
};

export async function runKnowledgeSync(
  opts: RunKnowledgeSyncOptions
): Promise<{ summary: SyncSummary; label: string }> {
  const log = opts.log ?? (() => {});
  const dryRun = opts.dryRun ?? false;

  if (!config.rag.aiPgUrl) {
    throw new Error(
      "No AI Postgres configured. Set VIRLY_AI_PG_URL (or VIRLY_VECTOR_DB_URL / VIRLY_POSTGRES_URL)."
    );
  }
  if (!dryRun && !isEmbeddingsConfigured()) {
    throw new Error("OPENAI_API_KEY is required to embed documents (or pass --dry-run).");
  }

  const { source, label } = await buildKnowledgeSource({
    kind: opts.kind,
    category: opts.category,
    folderId: opts.folderId,
    dir: opts.dir,
    log
  });
  opts.onStart?.({ label, dryRun });

  // migrate() is idempotent (tracked in __drizzle_migrations_ai); a no-op once applied.
  if (!dryRun) {
    await runAiMigrations();
  }

  const summary = await syncKnowledgeBase(source, {
    dryRun,
    force: opts.force ?? false,
    log
  });

  return { summary, label };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `server/`): `npm test -- src/ai/rag/__tests__/sync-runner.test.ts`
Expected: PASS - all 4 tests green.

- [ ] **Step 5: Refactor the CLI script onto the runner**

Replace the entire contents of `server/scripts/sync-knowledge-base.ts` with:

```ts
/**
 * Sync the RAG knowledge base from a source into pgvector (RAG_PLAN.md §4).
 *
 * Run from server/:
 *   npm run rag:sync -- --source=drive                 # sync the Drive folder (M2)
 *   npm run rag:sync -- --source=local --dir=/abs/path # sync a local folder (M1)
 *   npm run rag:sync -- ... --dry-run                  # show the plan, write nothing
 *   npm run rag:sync -- ... --force                    # re-embed even unchanged files
 *
 * Drive uses VIRLY_RAG_DRIVE_FOLDER_ID + a service account
 * (VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON or VIRLY_GOOGLE_APPLICATION_CREDENTIALS).
 * Local uses --dir or VIRLY_RAG_LOCAL_DIR. Both require VIRLY_AI_PG_URL and,
 * unless --dry-run, OPENAI_API_KEY.
 *
 * The source-building + orchestration live in src/ai/rag/sync-runner.ts so the
 * in-process scheduler can reuse them; this file is just the CLI shell.
 */
import { closeAiPool } from "../src/db/vector.js";
import { runKnowledgeSync, type KnowledgeSourceKind } from "../src/ai/rag/sync-runner.js";

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const kind = (getFlag("source") ?? "drive") as KnowledgeSourceKind;

  const { summary } = await runKnowledgeSync({
    kind,
    dir: getFlag("dir"),
    folderId: getFlag("folder"),
    category: getFlag("category"),
    dryRun: hasFlag("dry-run"),
    force: hasFlag("force"),
    log: (m) => console.log(`  ${m}`),
    onStart: ({ label, dryRun }) =>
      console.log(`Knowledge sync — source=${label}${dryRun ? " [dry-run]" : ""}`)
  });

  console.log(
    `Done: ${summary.created} created, ${summary.updated} updated, ` +
      `${summary.skipped} skipped, ${summary.removed} removed, ${summary.chunks} chunks.`
  );
}

main()
  .then(() => closeAiPool())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeAiPool().catch(() => {});
    process.exit(1);
  });
```

Note: the original used an em dash in the header line `Knowledge sync — source=...`. It is preserved verbatim here only because it is an exact existing console string, not new prose. Leave it as-is to keep output byte-identical.

- [ ] **Step 6: Verify the build typechecks and the CLI still parses args (no regression)**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0, no type errors.

Run (from `server/`): `npm run rag:sync -- --source=bogus`
Expected: the process prints `Unknown source kind=bogus. Use 'drive' or 'local'.` and exits non-zero. (This reaches `buildKnowledgeSource` before any DB call, proving the CLI still wires through the runner.)

- [ ] **Step 7: Commit**

```bash
git add server/src/ai/rag/sync-runner.ts \
        server/src/ai/rag/__tests__/sync-runner.test.ts \
        server/scripts/sync-knowledge-base.ts
git commit -m "refactor(rag): extract reusable knowledge-sync runner from the CLI"
```

---

## Task 2: Add a pgvector advisory-lock primitive for the run-lock

A session-level Postgres advisory lock gives us "skip if a sync is already running" with no new dependency, and - unlike an in-process boolean - it also protects against a second server instance or a manual `npm run rag:sync` colliding with the scheduled run.
The lock and its release MUST happen on the same connection, so we check out one dedicated client from the AI pool and hold it until release.

`vector.ts` owns the AI pool, so the helper lives there. Per the convention documented at the top of `server/src/db/__tests__/vector.test.ts` ("getAiDb(), runAiMigrations() require a live pgvector Postgres and are not tested here"), this live-DB primitive is not Jest-unit-tested; its behavior is exercised by the scheduler's injected-fake tests in Task 4 and by the manual DB check in Step 3 below.

**Files:**
- Modify: `server/src/db/vector.ts` (add an export after `closeAiPool`, around line 85)

**Interfaces:**
- Consumes (already exists): the module-private `pool` and `getAiDb()` in `vector.ts`; `pg.Pool.connect()`.
- Produces: `tryAcquireAiAdvisoryLock(key: number): Promise<(() => Promise<void>) | null>` - resolves to a release function when the lock is acquired, or `null` when it is already held.

- [ ] **Step 1: Implement the advisory-lock helper**

In `server/src/db/vector.ts`, append this export after the existing `closeAiPool` function (current end of file, after line 85):

```ts
/**
 * Try to take a session-level pgvector advisory lock on a dedicated pooled
 * client. Returns a release function on success, or null when the lock is
 * already held (e.g. another sync - in this process, another instance, or a
 * manual `npm run rag:sync` - is running). The SAME client must hold and release
 * the lock, so we check one out and keep it checked out until release.
 *
 * Used by the scheduled RAG sync to satisfy "skip if a sync is already running".
 */
export async function tryAcquireAiAdvisoryLock(
  key: number
): Promise<(() => Promise<void>) | null> {
  getAiDb(); // ensure the pool is initialized
  if (!pool) throw new Error("AI Postgres pool is not initialized.");
  const client = await pool.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [key]
    );
    if (!result.rows[0]?.locked) {
      client.release();
      return null;
    }
  } catch (error) {
    client.release();
    throw error;
  }
  return async () => {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    } finally {
      client.release();
    }
  };
}
```

- [ ] **Step 2: Verify the build typechecks**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

- [ ] **Step 3: Manually verify the lock against the local pgvector**

Start the dev Postgres if it is not already running (from repo root): `docker compose up -d postgres`

Then run (from `server/`):

```bash
VIRLY_AI_PG_URL=postgres://virly:virly@localhost:5432/virly npx tsx -e '
import { tryAcquireAiAdvisoryLock, closeAiPool } from "./src/db/vector.js";
const first = await tryAcquireAiAdvisoryLock(4915021);
const second = await tryAcquireAiAdvisoryLock(4915021);
console.log("first:", first ? "acquired" : "null", "| second:", second ? "acquired" : "null");
if (first) await first();
const third = await tryAcquireAiAdvisoryLock(4915021);
console.log("after release:", third ? "acquired" : "null");
if (third) await third();
await closeAiPool();
'
```

Expected output:
```
first: acquired | second: null
after release: acquired
```
This proves the lock is mutually exclusive while held and re-acquirable after release.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/vector.ts
git commit -m "feat(rag): add pgvector advisory-lock helper for the sync run-lock"
```

---

## Task 3: Add the ops-alert email sender and the `rag.sync` config block

The scheduled sync emails an alert on failure. We add an injectable email function (mirroring the existing `sendVerificationEmailWithSender` pattern so it is unit-testable), plus the full `rag.sync` config block (`enabled`, `intervalMs`, `alertEmail`) in one atomic config edit so later tasks only consume it.

**Files:**
- Modify: `server/src/config.ts` (add a `sync` sub-block inside `rag`, after the `drive` block at line 310)
- Modify: `server/src/services/email.service.ts` (add two exports at end of file)
- Modify: `server/.env.example` (document the three new vars)
- Create: tests added to `server/src/services/__tests__/email.opsAlert.test.ts`

**Interfaces:**
- Consumes (already exists): `config.email.from`, `config.email.resendApiKey`; the file-local `EmailSender` type and `createResendSender(apiKey)` in `email.service.ts`.
- Produces:
  - `config.rag.sync: { enabled: boolean; intervalMs: number; alertEmail: string | undefined }`
  - `sendOpsAlertEmailWithSender(subject: string, text: string, to: string | undefined, sender: EmailSender | null): Promise<{ delivered: boolean }>`
  - `sendOpsAlertEmail(subject: string, text: string): Promise<{ delivered: boolean }>`

- [ ] **Step 1: Add the `rag.sync` config block**

In `server/src/config.ts`, replace this exact existing fragment (the end of the `drive` block and the close of `rag`, lines 307-311):

```ts
      serviceAccountFile: getOptionalStringEnv("VIRLY_GOOGLE_APPLICATION_CREDENTIALS", {
        aliases: ["GOOGLE_APPLICATION_CREDENTIALS"]
      })
    }
  },
```

with:

```ts
      serviceAccountFile: getOptionalStringEnv("VIRLY_GOOGLE_APPLICATION_CREDENTIALS", {
        aliases: ["GOOGLE_APPLICATION_CREDENTIALS"]
      })
    },
    /** In-process scheduled Drive sync (a timer in the server process). */
    sync: {
      /** Opt-in: the server only schedules the sync when this is true. */
      enabled: getBooleanEnv("VIRLY_RAG_SYNC_ENABLED", { defaultValue: false }),
      /**
       * How often the in-process scheduler runs rag:sync --source=drive.
       * Default 6h. The 5-minute floor is deliberate: for near-real-time
       * freshness use a Google Drive push webhook, do NOT shrink this
       * (polling-for-real-time antipattern).
       */
      intervalMs: getIntEnv("VIRLY_RAG_SYNC_INTERVAL_MS", {
        defaultValue: 6 * 60 * 60 * 1000,
        min: 5 * 60 * 1000,
        max: 7 * 24 * 60 * 60 * 1000
      }),
      /** Where a failed sync emails an alert. Falls back to console.error if unset. */
      alertEmail: getOptionalStringEnv("VIRLY_RAG_SYNC_ALERT_EMAIL")
    }
  },
```

- [ ] **Step 2: Write the failing email test**

Create `server/src/services/__tests__/email.opsAlert.test.ts`:

```ts
import { sendOpsAlertEmailWithSender } from "../email.service.js";

type SentPayload = { from: string; to: string; subject: string; text: string; html: string };

function fakeSender(behavior: { error?: unknown } = {}) {
  const sent: SentPayload[] = [];
  return {
    sent,
    sender: {
      async send(payload: SentPayload) {
        sent.push(payload);
        return { error: behavior.error };
      }
    }
  };
}

describe("sendOpsAlertEmailWithSender", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
  });

  function silenceConsoleError() {
    const original = console.error;
    console.error = () => {};
    cleanups.push(() => {
      console.error = original;
    });
  }

  test("delivers via the sender and reports delivered:true", async () => {
    const { sent, sender } = fakeSender();
    const result = await sendOpsAlertEmailWithSender("subj", "body", "ops@virly.test", sender);
    expect(result).toEqual({ delivered: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ops@virly.test");
    expect(sent[0].subject).toBe("subj");
    expect(sent[0].text).toBe("body");
  });

  test("reports delivered:false when there is no sender", async () => {
    silenceConsoleError();
    const result = await sendOpsAlertEmailWithSender("subj", "body", "ops@virly.test", null);
    expect(result).toEqual({ delivered: false });
  });

  test("reports delivered:false when there is no recipient", async () => {
    silenceConsoleError();
    const { sent, sender } = fakeSender();
    const result = await sendOpsAlertEmailWithSender("subj", "body", undefined, sender);
    expect(result).toEqual({ delivered: false });
    expect(sent).toHaveLength(0);
  });

  test("reports delivered:false when the provider returns an error", async () => {
    silenceConsoleError();
    const { sender } = fakeSender({ error: new Error("boom") });
    const result = await sendOpsAlertEmailWithSender("subj", "body", "ops@virly.test", sender);
    expect(result).toEqual({ delivered: false });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `server/`): `npm test -- src/services/__tests__/email.opsAlert.test.ts`
Expected: FAIL - `sendOpsAlertEmailWithSender` is not exported yet.

- [ ] **Step 4: Implement the ops-alert senders**

Append to the end of `server/src/services/email.service.ts`:

```ts
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Send an ops/admin alert via the given sender. Injectable for tests, mirroring
 * sendVerificationEmailWithSender. Falls back to console.error (so the alert is
 * never silently dropped) when there is no sender or no recipient configured.
 */
export async function sendOpsAlertEmailWithSender(
  subject: string,
  text: string,
  to: string | undefined,
  sender: EmailSender | null
): Promise<{ delivered: boolean }> {
  if (!sender || !to) {
    console.error(`[ops-alert] ${subject}\n${text}`);
    return { delivered: false };
  }
  const result = await sender.send({
    from: config.email.from,
    to,
    subject,
    text,
    html: `<pre>${escapeHtml(text)}</pre>`
  });
  if (result.error) {
    console.error("[ops-alert] email delivery failed.", result.error);
    console.error(`[ops-alert] ${subject}\n${text}`);
    return { delivered: false };
  }
  return { delivered: true };
}

/**
 * Email an ops alert to VIRLY_RAG_SYNC_ALERT_EMAIL using Resend when configured.
 * Used by the scheduled RAG sync on a failed run.
 */
export async function sendOpsAlertEmail(
  subject: string,
  text: string
): Promise<{ delivered: boolean }> {
  const sender = config.email.resendApiKey
    ? createResendSender(config.email.resendApiKey)
    : null;
  return sendOpsAlertEmailWithSender(subject, text, config.rag.sync.alertEmail, sender);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `server/`): `npm test -- src/services/__tests__/email.opsAlert.test.ts`
Expected: PASS - all 4 tests green.

- [ ] **Step 6: Document the new env vars**

In `server/.env.example`, add these lines to the RAG section (after `VIRLY_RAG_DRIVE_FOLDER_ID` / the Drive vars):

```env
# Scheduled in-process RAG sync (server timer). Opt-in.
VIRLY_RAG_SYNC_ENABLED=false
# How often to sync from Drive, in ms. Default 6h (21600000). Floor 5min.
VIRLY_RAG_SYNC_INTERVAL_MS=21600000
# Where a failed scheduled sync emails an alert (falls back to logs if unset).
VIRLY_RAG_SYNC_ALERT_EMAIL=
```

- [ ] **Step 7: Verify the build typechecks**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0 (confirms `config.rag.sync` and the new exports are consistent).

- [ ] **Step 8: Commit**

```bash
git add server/src/config.ts server/src/services/email.service.ts \
        server/src/services/__tests__/email.opsAlert.test.ts server/.env.example
git commit -m "feat(rag): add ops-alert email sender and rag.sync config"
```

---

## Task 4: Build the in-process RAG sync scheduler

This is the core deliverable: a single scheduled run that takes the advisory lock, runs the Drive sync with `force: false`, emails an alert on failure, and always releases the lock; plus the timer wiring.
The per-run logic takes its lock / runner / alert collaborators as injectable options (defaulting to the real ones) so it is fully unit-testable without a DB, OpenAI, or Resend.

**Files:**
- Create: `server/src/ai/rag/sync-scheduler.ts`
- Create: `server/src/ai/rag/__tests__/sync-scheduler.test.ts`

**Interfaces:**
- Consumes: `tryAcquireAiAdvisoryLock(key)` from `../../db/vector.js` (Task 2); `runKnowledgeSync(opts)` + `type RunKnowledgeSyncOptions` from `./sync-runner.js` (Task 1); `sendOpsAlertEmail(subject, text)` from `../../services/email.service.js` (Task 3); `config.rag.sync` from `../../config.js` (Task 3).
- Produces (Task 5 relies on these exact names):
  - `runScheduledRagSync(deps?: ScheduledRagSyncDeps): Promise<void>`
  - `startRagSyncScheduler(intervalMs?: number): NodeJS.Timeout | null`
  - `type ScheduledRagSyncDeps = { acquireLock?: (key: number) => Promise<(() => Promise<void>) | null>; run?: typeof runKnowledgeSync; alert?: (subject: string, text: string) => Promise<unknown>; now?: () => number }`

- [ ] **Step 1: Write the failing scheduler test**

Create `server/src/ai/rag/__tests__/sync-scheduler.test.ts`:

```ts
import { runScheduledRagSync } from "../sync-scheduler.js";
import type { SyncSummary } from "../ingest.js";

const SUMMARY: SyncSummary = { created: 1, updated: 0, skipped: 4, removed: 0, chunks: 9 };

function okRun() {
  const calls: Array<Record<string, unknown>> = [];
  const run = async (opts: Record<string, unknown>) => {
    calls.push(opts);
    return { summary: SUMMARY, label: "drive folder=test" };
  };
  return { calls, run };
}

function lock() {
  const released = { count: 0 };
  const release = async () => {
    released.count += 1;
  };
  return { released, release };
}

describe("runScheduledRagSync", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0).reverse()) c();
  });
  function silenceConsole() {
    const log = console.log;
    const err = console.error;
    console.log = () => {};
    console.error = () => {};
    cleanups.push(() => {
      console.log = log;
      console.error = err;
    });
  }

  test("skips and does not run when the lock is already held", async () => {
    silenceConsole();
    const { calls, run } = okRun();
    let alerted = 0;
    await runScheduledRagSync({
      acquireLock: async () => null, // lock held by someone else
      run,
      alert: async () => {
        alerted += 1;
      }
    });
    expect(calls).toHaveLength(0);
    expect(alerted).toBe(0);
  });

  test("runs the drive sync with force:false and releases the lock", async () => {
    silenceConsole();
    const { calls, run } = okRun();
    const { released, release } = lock();
    await runScheduledRagSync({
      acquireLock: async () => release,
      run,
      alert: async () => {}
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "drive", force: false });
    expect(released.count).toBe(1);
  });

  test("emails an ops alert and still releases the lock when the sync throws", async () => {
    silenceConsole();
    const { released, release } = lock();
    let alertSubject = "";
    await runScheduledRagSync({
      acquireLock: async () => release,
      run: async () => {
        throw new Error("drive exploded");
      },
      alert: async (subject: string) => {
        alertSubject = subject;
      }
    });
    expect(alertSubject).toMatch(/RAG sync failed/i);
    expect(released.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `server/`): `npm test -- src/ai/rag/__tests__/sync-scheduler.test.ts`
Expected: FAIL - `Cannot find module '../sync-scheduler.js'`.

- [ ] **Step 3: Implement the scheduler**

Create `server/src/ai/rag/sync-scheduler.ts`:

```ts
/**
 * In-process scheduled Drive sync (the Todoist "scheduled idempotent RAG sync").
 *
 * Mirrors the startDailyFxRefresh / startTtlSweeper precedent: a setInterval
 * started from index.ts, unref'd so it never keeps the process alive. Each run:
 *   1. takes a pgvector advisory lock - skip if a sync is already running;
 *   2. runs rag:sync --source=drive with force:false (the corpus is already
 *      idempotent, so --force is never used here);
 *   3. emails an ops alert on failure;
 *   4. always releases the lock.
 *
 * The scheduler keeps the AI pool open (unlike the CLI) because the running
 * server also serves RAG queries from it.
 */
import { config } from "../../config.js";
import { tryAcquireAiAdvisoryLock } from "../../db/vector.js";
import { sendOpsAlertEmail } from "../../services/email.service.js";
import { runKnowledgeSync } from "./sync-runner.js";

/** Arbitrary but stable advisory-lock key reserved for the RAG sync job. */
export const RAG_SYNC_LOCK_KEY = 4_915_021;

export type ScheduledRagSyncDeps = {
  acquireLock?: (key: number) => Promise<(() => Promise<void>) | null>;
  run?: typeof runKnowledgeSync;
  alert?: (subject: string, text: string) => Promise<unknown>;
  now?: () => number;
};

/** Run one scheduled Drive sync. Collaborators are injectable for tests. */
export async function runScheduledRagSync(deps: ScheduledRagSyncDeps = {}): Promise<void> {
  const acquireLock = deps.acquireLock ?? tryAcquireAiAdvisoryLock;
  const run = deps.run ?? runKnowledgeSync;
  const alert = deps.alert ?? sendOpsAlertEmail;
  const now = deps.now ?? Date.now;

  const release = await acquireLock(RAG_SYNC_LOCK_KEY);
  if (!release) {
    console.log("[rag-sync] skipped: a sync is already running");
    return;
  }

  const startedAt = now();
  try {
    const { summary, label } = await run({
      kind: "drive",
      force: false,
      log: (m) => console.log(`[rag-sync]   ${m}`),
      onStart: ({ label: l }) => console.log(`[rag-sync] start source=${l}`)
    });
    console.log(
      `[rag-sync] done source=${label} ${summary.created} created, ${summary.updated} updated, ` +
        `${summary.skipped} skipped, ${summary.removed} removed, ${summary.chunks} chunks ` +
        `(${now() - startedAt}ms)`
    );
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("[rag-sync] failed:", detail);
    await alert("Virly RAG sync failed", `The scheduled RAG knowledge-base sync failed.\n\n${detail}`).catch(
      (e) => console.error("[rag-sync] alert email failed:", e)
    );
  } finally {
    await release().catch((e) => console.error("[rag-sync] lock release failed:", e));
  }
}

let timer: NodeJS.Timeout | null = null;

/**
 * Start the periodic Drive sync. No-op when VIRLY_RAG_SYNC_ENABLED is false or
 * when already started. Runs once shortly after boot, then every intervalMs.
 * The boot run is cheap on a warm corpus because unchanged docs are skipped.
 */
export function startRagSyncScheduler(
  intervalMs: number = config.rag.sync.intervalMs
): NodeJS.Timeout | null {
  if (timer) return timer;
  if (!config.rag.sync.enabled) return null;

  void runScheduledRagSync();
  timer = setInterval(() => void runScheduledRagSync(), intervalMs);
  timer.unref();
  return timer;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `server/`): `npm test -- src/ai/rag/__tests__/sync-scheduler.test.ts`
Expected: PASS - all 3 tests green.

- [ ] **Step 5: Verify the build typechecks**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/ai/rag/sync-scheduler.ts \
        server/src/ai/rag/__tests__/sync-scheduler.test.ts
git commit -m "feat(rag): in-process scheduler for the idempotent Drive sync"
```

---

## Task 5: Wire the scheduler into server boot and document it

Start the scheduler at boot next to the existing schedulers, then document the new behavior in operations.md. The scheduler self-guards on `config.rag.sync.enabled`, so this is a safe no-op for every environment that has not opted in.

**Files:**
- Modify: `server/src/index.ts` (add an import and one call in `bootstrap`)
- Modify: `docs/operations.md` (add a subsection under §5.2)

**Interfaces:**
- Consumes: `startRagSyncScheduler()` from `./ai/rag/sync-scheduler.js` (Task 4).

- [ ] **Step 1: Add the import**

In `server/src/index.ts`, add this import after the existing `startTtlSweeper` import (line 7):

```ts
import { startRagSyncScheduler } from "./ai/rag/sync-scheduler.js";
```

- [ ] **Step 2: Start the scheduler at boot**

In `server/src/index.ts`, replace this exact existing fragment (lines 17-18):

```ts
  if (config.dbDriver === "postgres") startTtlSweeper();
  startDailyFxRefresh();
```

with:

```ts
  if (config.dbDriver === "postgres") startTtlSweeper();
  startDailyFxRefresh();
  // Scheduled Drive RAG sync (no-op unless VIRLY_RAG_SYNC_ENABLED=true).
  startRagSyncScheduler();
```

- [ ] **Step 3: Verify the build typechecks**

Run (from `server/`): `npm run build`
Expected: PASS - `tsc` exits 0.

- [ ] **Step 4: Smoke-test boot with the scheduler disabled (default)**

Run (from `server/`): `npm run dev` and wait for `Server running on ...`, then stop it (Ctrl-C).
Expected: the server boots normally and prints NO `[rag-sync]` lines (because `VIRLY_RAG_SYNC_ENABLED` defaults to false). This confirms the wiring is a safe no-op by default.

- [ ] **Step 5: Run the full server test suite (no regressions)**

Run (from `server/`): `npm test`
Expected: PASS - the existing suite plus the three new test files are all green.

- [ ] **Step 6: Document the scheduled sync**

In `docs/operations.md`, immediately after the §5.2 "Validated against ..." note (the line ending `...lines 69-76 (env checks)._`, around line 599), insert:

```markdown

**Scheduled sync (in-process).** When `VIRLY_RAG_SYNC_ENABLED=true`, the server
runs `rag:sync --source=drive` on a timer (`VIRLY_RAG_SYNC_INTERVAL_MS`, default
6h) from `server/src/ai/rag/sync-scheduler.ts`. It never passes `--force` (the
corpus is already idempotent). Overlapping runs are skipped via a pgvector
advisory lock, and a failed run emails `VIRLY_RAG_SYNC_ALERT_EMAIL` (falling back
to `console.error`). Do NOT lower the interval below its 5-minute floor to chase
freshness: if near-real-time is ever needed, add a Google Drive push webhook
instead (polling-for-real-time antipattern). `--force` stays reserved for a
deliberate one-off full re-embed, e.g. after changing `VIRLY_RAG_EMBEDDING_MODEL`
or the embedding dimensions.

**Enable in production:** set `VIRLY_RAG_SYNC_ENABLED=true` plus the Drive sync
env (`VIRLY_RAG_DRIVE_FOLDER_ID`, a service account, `VIRLY_AI_PG_URL`,
`OPENAI_API_KEY`) and `VIRLY_RAG_SYNC_ALERT_EMAIL` on the Render service.
```

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts docs/operations.md
git commit -m "feat(rag): start the scheduled Drive sync at boot and document it"
```

---

## How to enable in production (Render)

The scheduler is opt-in. On the Render server service, set:

- `VIRLY_RAG_SYNC_ENABLED=true`
- `VIRLY_RAG_SYNC_INTERVAL_MS` (optional; default `21600000` = 6h)
- `VIRLY_RAG_SYNC_ALERT_EMAIL=<ops address>`
- and the existing Drive sync env it depends on: `VIRLY_RAG_DRIVE_FOLDER_ID`, `VIRLY_GOOGLE_SERVICE_ACCOUNT_JSON` (or `VIRLY_GOOGLE_APPLICATION_CREDENTIALS`), `VIRLY_AI_PG_URL`, `OPENAI_API_KEY`.

A first sync runs shortly after boot; thereafter every interval. If a run fails (bad creds, embeddings API down, DB unreachable), you get an email and the next interval retries.

Caveat of the in-process choice: the sync shares the web service's process and memory, and will not run while that service is asleep or scaled to zero. If either becomes a problem, the run logic is already scheduler-agnostic (lock + alert + `force:false` live in the script), so moving the trigger to a Render Cron Job later is a small change - it would just call `runScheduledRagSync()` (or `npm run rag:sync -- --source=drive`) instead of the in-process timer.

---

## Self-Review

**Spec coverage (against the Todoist task):**

- "Add a timed `npm --workspace server run rag:sync -- --source=drive` job" - Task 4 scheduler runs `runKnowledgeSync({ kind: "drive" })` on a `setInterval`, wired at boot in Task 5. Covered.
- "(NO --force)" - Global Constraints + Task 4 pass `force: false` explicitly; the scheduler test asserts `force:false`. Covered.
- "at an interval matched to how often the policy/loan docs actually change (hourly to a few times/day is plenty)" - `VIRLY_RAG_SYNC_INTERVAL_MS`, default 6h (Task 3). Covered.
- "a run-lock (skip if a sync is already running)" - Task 2 advisory lock; Task 4 skips when it cannot acquire; test "skips when the lock is held". Covered.
- "alerting on non-zero exit" - Task 3 `sendOpsAlertEmail`; Task 4 alerts in the catch block; test "emails an ops alert ... when the sync throws". (In-process, a thrown sync is the equivalent of the CLI's non-zero exit.) Covered.
- "switch to a Google Drive push webhook ... (polling-for-real-time antipattern)" - documented in Global Constraints, the config comment, the 5-minute floor, and operations.md. Covered (as guidance + guardrail, not code).
- "Reserve --force for deliberate one-off full re-embeds" - the scheduler never passes it; documented in operations.md. Covered.

**Placeholder scan:** No TBD / "add error handling" / "write tests for the above" / "similar to Task N" placeholders. Every code step shows complete code; every test step shows the full test; every run step gives the exact command and expected result.

**Type consistency:** `KnowledgeSourceKind`, `RunKnowledgeSyncOptions`, `runKnowledgeSync`, and `buildKnowledgeSource` are defined in Task 1 and consumed with the same names/shapes in Task 4. `tryAcquireAiAdvisoryLock(key) => Promise<release | null>` is defined in Task 2 and matched by the `acquireLock` dep type in Task 4. `sendOpsAlertEmail(subject, text)` is defined in Task 3 and matched by the `alert` dep type in Task 4. `config.rag.sync.{enabled,intervalMs,alertEmail}` is defined in Task 3 and read in Tasks 3-4. `SyncSummary` is the existing type from `ingest.ts`, reused in tests. Consistent.
