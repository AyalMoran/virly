# Postgres Driver (Phase 1, Plan 2 of 2) Implementation Plan

> **✅ Completed — shipped to `main` via PR #2 ("complete Phase 1", commit
> `141be05`).** The Drizzle/Postgres repositories, `drizzle.config.ts`,
> `server/drizzle/` migrations, `src/db/postgres.ts`, the `ttl/sweeper.ts`, and
> the `server/scripts/sync-*`/`verify-parity.ts` tooling all exist, and
> `VIRLY_DB_DRIVER=postgres` is selectable at boot. The unchecked checkboxes
> below are the original execution tracker and are kept as a record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **PostgreSQL implementation** of the repository seam (built in
Plan 1) using Drizzle, satisfying the exact interfaces in
`server/src/repositories/types.ts`, proven byte-for-byte equivalent to the Mongo
implementation by a shared contract suite run against **both real databases**,
plus the config/boot wiring, TTL sweeper, and data-sync tooling to cut over and
roll back.

**Architecture:** `createRepositories("postgres")` (currently throws) returns
`createPostgresRepositories(db)`, a full `Repositories` whose methods mirror the
Mongo repos' semantics over Drizzle/`pg`. IDs stay 24-hex ObjectId strings
(generated app-side). `runInTransaction` maps to a Drizzle SQL transaction. In
Postgres mode the app still connects Mongo (LangGraph checkpointer/store stay on
Mongo — Phase 2). A periodic sweeper replaces Mongo's TTL indexes.

**Tech Stack:** Drizzle ORM (`drizzle-orm`, `drizzle-kit`), `pg` (node-postgres),
existing Node ESM + TypeScript + `node:test`/`tsx`.

**Predecessor:** Plan 1 (`docs/superpowers/plans/2026-06-22-postgres-migration-seam.md`) — **shipped on `main` via PR #1**.
**Design spec:** `docs/superpowers/specs/2026-06-22-postgres-migration-design.md`

## Global Constraints

- ESM: every relative import ends in `.js`. All paths relative to `server/`.
- The interfaces in `src/repositories/types.ts` are **frozen** for this plan — the
  Postgres impl satisfies them; do not change a signature. (If a genuine gap
  appears, change the interface **and** the Mongo impl in the same task so both
  drivers stay equal.)
- IDs are 24-hex ObjectId strings, generated app-side with
  `new mongoose.Types.ObjectId().toString()` on insert.
- Money/number columns are `double precision` (matches JS `Number` + node-pg's
  float8→number parser). **Do not use `numeric`** (returns strings; breaks parity).
- Enum-like columns are `text` + a `CHECK` constraint with the same allowed values.
- `Mixed`/`Map`/embedded objects → `jsonb`; `string[]` → `text[]`.
- The default `npm test` must stay green **without any database** — contract tests
  live under `server/tests/contract/` (outside the `src/**` glob) and run via a
  separate `npm run test:contract` against real DBs.
- The seam guard (`src/repositories/no-direct-model-imports.test.ts`) must stay
  green: only `src/repositories/mongo/` imports `../models/`. The Postgres repos
  import Drizzle schema, never models. `server/scripts/` is outside `src/` and may
  import both (it is migration infra).
- TDD; frequent commits.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` (modify) | Add `drizzle-orm`, `pg`; dev `drizzle-kit`, `@types/pg`; scripts `db:generate`, `db:migrate`, `test:contract`. |
| `drizzle.config.ts` (create) | drizzle-kit config (schema path, out dir, dialect, url). |
| `src/db/postgres.ts` (create) | `pg` pool + Drizzle instance singleton; `getPgDb()`, `closePgPool()`, `runPgMigrations()`. |
| `src/repositories/postgres/schema.ts` (create) | Drizzle table defs for all 9 tables + indexes/uniques/checks. |
| `src/repositories/postgres/id.ts` (create) | `newObjectId()`, `isObjectIdHex()`. |
| `src/repositories/postgres/errors.ts` (create) | `mapPgError(e)` → `DuplicateKeyError` on `23505`. |
| `src/repositories/postgres/transaction.ts` (create) | `runInTransaction` over Drizzle; `asPgTx(tx)`. |
| `src/repositories/postgres/<entity>.repository.ts` (create ×9) | Drizzle-backed implementations + row→record mappers. |
| `src/repositories/postgres/index.ts` (create) | `createPostgresRepositories(db)`. |
| `src/repositories/registry.ts` (modify) | Wire the `postgres` branch. |
| `src/db.ts` (modify) | Init pg pool + run migrations before `initRepositories()` when driver=postgres. |
| `src/index.ts` (modify) | Start the TTL sweeper in postgres mode. |
| `src/ttl/sweeper.ts` (create) | Interval delete of expired `ai_conversations` / `ai_pending_transfers`. |
| `server/tests/contract/harness.ts` (create) | Parameterized contract runner over a `Repositories` + DB lifecycle. |
| `server/tests/contract/<entity>.contract.test.ts` (create) | Behavioral cases run against Mongo **and** Postgres. |
| `server/scripts/{sync-mongo-to-postgres,sync-postgres-to-mongo,verify-parity}.ts` (create) | One-time sync both directions + parity check. |
| `docker-compose.test.yml` (create) | `postgres` + single-node replica-set `mongo` for the contract suite. |
| `.env.example`, `README.md` (modify) | Document `VIRLY_DB_DRIVER`, `VIRLY_POSTGRES_URL`, cutover runbook. |

---

## Stage A — Postgres infrastructure

### Task 1: Dependencies, drizzle config, pool

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.ts`, `src/db/postgres.ts`
- Test: `src/db/postgres.test.ts`

**Interfaces:**
- Produces: `getPgDb()`, `closePgPool()`, `runPgMigrations()`, `PgDatabase` type.

- [ ] **Step 1: Add deps**

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

- [ ] **Step 2: Write the failing test**

```ts
// src/db/postgres.test.ts
import assert from "node:assert/strict";
import test from "node:test";

test("getPgDb throws a clear error when no postgres url is configured", async () => {
  const prev = process.env.VIRLY_POSTGRES_URL;
  delete process.env.VIRLY_POSTGRES_URL;
  const mod = await import(`./postgres.js?ts=${Date.now()}`);
  assert.throws(() => mod.getPgDb(), /VIRLY_POSTGRES_URL/);
  if (prev) process.env.VIRLY_POSTGRES_URL = prev;
});
```

- [ ] **Step 3: Run test → FAIL** (`./postgres.js` missing).

Run: `npm test -- --test-name-pattern="getPgDb throws"`

- [ ] **Step 4: Implement**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/repositories/postgres/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.VIRLY_POSTGRES_URL ?? "" }
});
```

```ts
// src/db/postgres.ts
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../repositories/postgres/schema.js";
import { config } from "../config.js";

export type PgDatabase = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: PgDatabase | null = null;

export function getPgDb(): PgDatabase {
  if (db) return db;
  const url = config.postgresUrl;
  if (!url) throw new Error("VIRLY_POSTGRES_URL is required to use the postgres driver.");
  pool = new pg.Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  return db;
}

export async function runPgMigrations(): Promise<void> {
  await migrate(getPgDb(), { migrationsFolder: "./drizzle" });
}

export async function closePgPool(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
```

- [ ] **Step 5: Run test → PASS.** Add scripts to `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx -e \"import('./src/db/postgres.js').then(m => m.runPgMigrations()).then(() => process.exit(0))\"",
"test:contract": "tsx --test \"tests/contract/**/*.test.ts\""
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json drizzle.config.ts src/db/postgres.ts src/db/postgres.test.ts
git commit -m "feat(pg): add drizzle/pg deps and connection module"
```

---

### Task 2: Drizzle schema (all 9 tables)

**Files:**
- Create: `src/repositories/postgres/schema.ts`
- Test: `src/repositories/postgres/schema.test.ts`

**Interfaces:**
- Produces: `users, transactions, personalDetails, exchangeRates, aiConversations,
  aiPendingTransfers, aiAuditLogs, videoSessions, videoAuditLogs` Drizzle tables.

- [ ] **Step 1: Write the failing test**

```ts
// src/repositories/postgres/schema.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import * as schema from "./schema.js";

test("schema exports the 9 Phase-1 tables", () => {
  for (const name of [
    "users", "transactions", "personalDetails", "exchangeRates",
    "aiConversations", "aiPendingTransfers", "aiAuditLogs",
    "videoSessions", "videoAuditLogs"
  ]) {
    assert.ok((schema as Record<string, unknown>)[name], `missing table: ${name}`);
  }
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/repositories/postgres/schema.ts`**

```ts
import { sql } from "drizzle-orm";
import {
  pgTable, char, text, boolean, doublePrecision, integer,
  timestamp, jsonb, uniqueIndex, index, check
} from "drizzle-orm/pg-core";

const id = () => char("id", { length: 24 }).primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  personalDetails: char("personal_details", { length: 24 }),
  verificationTokenHash: text("verification_token_hash"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at", { withTimezone: true }),
  balance: doublePrecision("balance").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("users_email_uq").on(t.email),
  index("users_role_idx").on(t.role),
  check("users_role_ck", sql`${t.role} in ('user','support_agent','sales_agent','support_manager','admin')`)
]);

export const transactions = pgTable("transactions", {
  id: id(),
  ownerId: char("owner_id", { length: 24 }).notNull(),
  counterpartyEmail: text("counterparty_email").notNull(),
  amount: doublePrecision("amount").notNull(),
  type: text("type").notNull(),
  directionLabel: text("direction_label").notNull(),
  reason: text("reason"),
  enteredCurrency: text("entered_currency"),
  enteredAmount: doublePrecision("entered_amount"),
  exchangeRateUsed: doublePrecision("exchange_rate_used"),
  exchangeRateFetchedAt: timestamp("exchange_rate_fetched_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("transactions_owner_idx").on(t.ownerId),
  index("transactions_owner_cp_created_idx").on(t.ownerId, t.counterpartyEmail, t.createdAt),
  check("transactions_type_ck", sql`${t.type} in ('credit','debit')`)
]);

export const personalDetails = pgTable("personal_details", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  status: text("status").notNull().default("not_provided"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
  address: jsonb("address").notNull().default(sql`'{}'::jsonb`),
  lastSkippedAt: timestamp("last_skipped_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("personal_details_user_uq").on(t.userId),
  index("personal_details_name_idx").on(t.firstName, t.lastName),
  check("personal_details_status_ck", sql`${t.status} in ('not_provided','provided')`)
]);

export const exchangeRates = pgTable("exchange_rates", {
  id: id(),
  baseCurrency: text("base_currency").notNull(),
  rates: jsonb("rates").notNull(),
  provider: text("provider").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  validForDate: text("valid_for_date").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sourceResponseHash: text("source_response_hash"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("exchange_rates_base_date_uq").on(t.baseCurrency, t.validForDate),
  index("exchange_rates_base_fetched_idx").on(t.baseCurrency, t.fetchedAt)
]);

export const aiConversations = pgTable("ai_conversations", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  conversationId: text("conversation_id").notNull(),
  assistantId: text("assistant_id").notNull().default("oshri"),
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  memory: jsonb("memory").notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("ai_conversations_user_conv_uq").on(t.userId, t.conversationId),
  index("ai_conversations_user_idx").on(t.userId),
  index("ai_conversations_expires_idx").on(t.expiresAt)
]);

export const aiPendingTransfers = pgTable("ai_pending_transfers", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  conversationId: text("conversation_id").notNull(),
  assistantId: text("assistant_id").notNull().default("oshri"),
  recipientEmail: text("recipient_email").notNull(),
  version: integer("version").notNull().default(1),
  currency: text("currency").notNull().default("ILS"),
  recipientFirstName: text("recipient_first_name"),
  recipientLastName: text("recipient_last_name"),
  amount: doublePrecision("amount").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  supersededById: char("superseded_by_id", { length: 24 }),
  supersedesId: char("supersedes_id", { length: 24 }),
  idempotencyResults: jsonb("idempotency_results").notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("ai_pending_user_idx").on(t.userId),
  index("ai_pending_conv_idx").on(t.conversationId),
  index("ai_pending_status_idx").on(t.status),
  index("ai_pending_expires_idx").on(t.expiresAt),
  check("ai_pending_status_ck", sql`${t.status} in ('pending','confirmed','denied','expired','superseded')`),
  check("ai_pending_currency_ck", sql`${t.currency} = 'ILS'`)
]);

export const aiAuditLogs = pgTable("ai_audit_logs", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  conversationId: text("conversation_id").notNull(),
  requestId: text("request_id"),
  assistantId: text("assistant_id").notNull().default("oshri"),
  intent: text("intent").notNull(),
  toolsRequested: text("tools_requested").array().notNull().default(sql`'{}'::text[]`),
  toolsExecuted: text("tools_executed").array().notNull().default(sql`'{}'::text[]`),
  refusalReason: text("refusal_reason"),
  diagnostics: jsonb("diagnostics").notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("ai_audit_user_idx").on(t.userId),
  index("ai_audit_conv_idx").on(t.conversationId),
  index("ai_audit_request_idx").on(t.requestId)
]);

export const videoSessions = pgTable("video_sessions", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  assignedAgentId: char("assigned_agent_id", { length: 24 }),
  type: text("type").notNull(),
  status: text("status").notNull().default("waiting_for_agent"),
  roomName: text("room_name").notNull(),
  provider: text("provider").notNull(),
  topic: text("topic"),
  userProblemSummary: text("user_problem_summary"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  userJoinedAt: timestamp("user_joined_at", { withTimezone: true }),
  agentJoinedAt: timestamp("agent_joined_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("video_sessions_room_uq").on(t.roomName),
  index("video_sessions_user_idx").on(t.userId),
  index("video_sessions_agent_idx").on(t.assignedAgentId),
  index("video_sessions_type_idx").on(t.type),
  index("video_sessions_status_idx").on(t.status),
  check("video_sessions_type_ck", sql`${t.type} in ('support','sales')`),
  check("video_sessions_status_ck", sql`${t.status} in ('requested','waiting_for_agent','active','ended','missed','cancelled','failed')`)
]);

export const videoAuditLogs = pgTable("video_audit_logs", {
  id: id(),
  event: text("event").notNull(),
  actorId: char("actor_id", { length: 24 }).notNull(),
  actorRole: text("actor_role").notNull(),
  targetUserId: char("target_user_id", { length: 24 }).notNull(),
  videoSessionId: char("video_session_id", { length: 24 }).notNull(),
  sessionType: text("session_type").notNull(),
  result: text("result").notNull().default("success"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("video_audit_event_idx").on(t.event),
  index("video_audit_actor_idx").on(t.actorId),
  index("video_audit_target_idx").on(t.targetUserId),
  index("video_audit_session_idx").on(t.videoSessionId),
  check("video_audit_result_ck", sql`${t.result} in ('success','failure')`)
]);
```

- [ ] **Step 4: Run → PASS.** Then generate the migration:

```bash
npm run db:generate   # writes drizzle/0000_*.sql
```

- [ ] **Step 5: Commit**

```bash
git add src/repositories/postgres/schema.ts src/repositories/postgres/schema.test.ts drizzle/
git commit -m "feat(pg): drizzle schema + initial migration for 9 tables"
```

---

### Task 3: Shared helpers (id, errors, transaction)

**Files:**
- Create: `src/repositories/postgres/id.ts`, `src/repositories/postgres/errors.ts`,
  `src/repositories/postgres/transaction.ts`
- Test: `src/repositories/postgres/id.test.ts`, `src/repositories/postgres/errors.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/repositories/postgres/id.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { newObjectId, isObjectIdHex } from "./id.js";

test("newObjectId returns a fresh 24-hex string", () => {
  const a = newObjectId();
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(a, newObjectId());
});

test("isObjectIdHex accepts 24-hex and rejects junk", () => {
  assert.equal(isObjectIdHex("507f1f77bcf86cd799439011"), true);
  assert.equal(isObjectIdHex("nope"), false);
});
```

```ts
// src/repositories/postgres/errors.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { mapPgError } from "./errors.js";
import { DuplicateKeyError } from "../types.js";

test("mapPgError converts 23505 to DuplicateKeyError", () => {
  const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_uq" });
  assert.throws(() => mapPgError(e, "email"), (x: unknown) => x instanceof DuplicateKeyError);
});

test("mapPgError rethrows other errors unchanged", () => {
  const e = new Error("other");
  assert.throws(() => mapPgError(e, "email"), (x: unknown) => x === e);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/repositories/postgres/id.ts
import mongoose from "mongoose";
export function newObjectId(): string { return new mongoose.Types.ObjectId().toString(); }
export function isObjectIdHex(id: string): boolean { return /^[0-9a-fA-F]{24}$/.test(id); }
```

```ts
// src/repositories/postgres/errors.ts
import { DuplicateKeyError } from "../types.js";
export function mapPgError(e: unknown, key: string): never {
  if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
    throw new DuplicateKeyError(key);
  }
  throw e;
}
```

```ts
// src/repositories/postgres/transaction.ts
import type { TxContext } from "../types.js";
import { getPgDb, type PgDatabase } from "../../db/postgres.js";

type PgTx = Parameters<Parameters<PgDatabase["transaction"]>[0]>[0];

/** The tx handle if inside a transaction, else the root db (so methods work both ways). */
export function asPgTx(tx?: TxContext): PgDatabase | PgTx {
  return (tx as PgTx | undefined) ?? getPgDb();
}

export async function runInTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
  return getPgDb().transaction(async (tx) => fn(tx));
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** `feat(pg): id/error/transaction helpers`.

---

## Stage B — Contract suite harness

### Task 4: Parameterized contract harness + first (User) cases

**Files:**
- Create: `server/tests/contract/harness.ts`, `server/tests/contract/user.contract.test.ts`
- Create: `docker-compose.test.yml`

**Interfaces:**
- Consumes: `createMongoRepositories`, `createPostgresRepositories` (Task 5+),
  `getPgDb`/`runPgMigrations`/`closePgPool`, mongoose.
- Produces: `describeContract(name, cases)` that runs `cases` against both drivers
  when their DB URL env vars are present; **skips** a driver when its env var is
  missing (so it never breaks a DB-less `npm test`/`test:contract` invocation).

- [ ] **Step 1: Write `docker-compose.test.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: virly
      POSTGRES_PASSWORD: virly
      POSTGRES_USER: virly
    ports: ["5433:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U virly"]
      interval: 3s
      timeout: 3s
      retries: 10
  mongo:
    image: mongo:7
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    ports: ["27018:27017"]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "try { rs.status() } catch (e) { rs.initiate() }"]
      interval: 5s
      timeout: 5s
      retries: 12
```

Run-recipe (documented in README, Task 17):
`docker compose -f docker-compose.test.yml up -d` then
`CONTRACT_PG_URL=postgres://virly:virly@localhost:5433/virly CONTRACT_MONGO_URL=mongodb://localhost:27018/virly_contract?replicaSet=rs0 npm run test:contract`.

- [ ] **Step 2: Write the harness**

```ts
// server/tests/contract/harness.ts
import test from "node:test";
import mongoose from "mongoose";
import { createMongoRepositories } from "../../src/repositories/mongo/index.js";
import { createPostgresRepositories } from "../../src/repositories/postgres/index.js";
import { getPgDb, runPgMigrations, closePgPool } from "../../src/db/postgres.js";
import type { Repositories } from "../../src/repositories/types.js";

export type ContractCtx = { repos: Repositories };
export type ContractCase = (ctx: ContractCtx, t: test.TestContext) => Promise<void>;

const PG_TABLES = [
  "video_audit_logs", "video_sessions", "ai_audit_logs", "ai_pending_transfers",
  "ai_conversations", "exchange_rates", "personal_details", "transactions", "users"
];

export function describeContract(name: string, cases: Record<string, ContractCase>) {
  // ---- Postgres driver ----
  const pgUrl = process.env.CONTRACT_PG_URL;
  test(`[postgres] ${name}`, { skip: pgUrl ? false : "set CONTRACT_PG_URL to run" }, async (t) => {
    process.env.VIRLY_POSTGRES_URL = pgUrl;
    await runPgMigrations();
    const db = getPgDb();
    const repos = createPostgresRepositories(db);
    for (const [label, fn] of Object.entries(cases)) {
      await t.test(label, async (st) => {
        await db.execute(`TRUNCATE ${PG_TABLES.join(", ")} CASCADE`);
        await fn({ repos }, st);
      });
    }
    await closePgPool();
  });

  // ---- Mongo driver ----
  const mongoUrl = process.env.CONTRACT_MONGO_URL;
  test(`[mongo] ${name}`, { skip: mongoUrl ? false : "set CONTRACT_MONGO_URL to run" }, async (t) => {
    await mongoose.connect(mongoUrl!);
    const repos = createMongoRepositories();
    for (const [label, fn] of Object.entries(cases)) {
      await t.test(label, async (st) => {
        await mongoose.connection.dropDatabase();
        await fn({ repos }, st);
      });
    }
    await mongoose.disconnect();
  });
}
```

- [ ] **Step 3: Write the User contract cases (drives Task 5)**

```ts
// server/tests/contract/user.contract.test.ts
import assert from "node:assert/strict";
import { describeContract } from "./harness.js";
import { DuplicateKeyError } from "../../src/repositories/types.js";

describeContract("UserRepository", {
  "create then findById round-trips a record with a 24-hex id": async ({ repos }) => {
    const u = await repos.users.create({ email: "A@B.com", passwordHash: "h", phone: "+972", balance: 50 });
    assert.match(u.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(u.email, "a@b.com"); // lowercased
    const found = await repos.users.findById(u.id);
    assert.equal(found?.balance, 50);
  },
  "findByIdSafe omits secrets": async ({ repos }) => {
    const u = await repos.users.create({ email: "s@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    const safe = await repos.users.findByIdSafe(u.id);
    assert.equal((safe as Record<string, unknown>).passwordHash, undefined);
  },
  "duplicate email rejects with DuplicateKeyError": async ({ repos }) => {
    await repos.users.create({ email: "dup@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    await assert.rejects(
      () => repos.users.create({ email: "dup@x.com", passwordHash: "h", phone: "+972", balance: 0 }),
      (e: unknown) => e instanceof DuplicateKeyError
    );
  },
  "findById returns null for a malformed id": async ({ repos }) => {
    assert.equal(await repos.users.findById("not-an-id"), null);
  },
  "setBalance / markVerified mutate as expected": async ({ repos }) => {
    const u = await repos.users.create({ email: "m@x.com", passwordHash: "h", phone: "+972", balance: 0 });
    await repos.users.setBalance(u.id, 999);
    await repos.users.markVerified(u.id);
    const after = await repos.users.findById(u.id);
    assert.equal(after?.balance, 999);
    assert.equal(after?.isVerified, true);
  }
});
```

- [ ] **Step 4: Run (no DB yet) → both driver blocks SKIP** (env vars unset):

Run: `npm run test:contract`
Expected: tests reported as skipped, exit 0. (This also proves the default
`npm test` is unaffected.)

- [ ] **Step 5: Commit** `test(pg): contract harness + user cases`.

---

## Stage C — Postgres repositories

Each task implements one `src/repositories/postgres/<entity>.repository.ts` to
satisfy its interface, then runs the contract suite for that entity against a real
Postgres + real Mongo (both green = parity). Every read/write method threads
`asPgTx(tx)` so it works inside `runInTransaction`. Every insert sets
`id: newObjectId()`, `createdAt`/`updatedAt: new Date()`; updates set
`updatedAt: new Date()`.

### Task 5: User Postgres repo (reference — full code)

**Files:**
- Create: `src/repositories/postgres/user.repository.ts`
- Use: `server/tests/contract/user.contract.test.ts` (Task 4)

- [ ] **Step 1:** With `CONTRACT_PG_URL`/`CONTRACT_MONGO_URL` set, run
  `npm run test:contract -- --test-name-pattern="UserRepository"` → the `[postgres]`
  block FAILS (no `createPostgresRepositories`), `[mongo]` PASSES.

- [ ] **Step 2: Implement**

```ts
// src/repositories/postgres/user.repository.ts
import { and, eq, inArray } from "drizzle-orm";
import { users } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId, isObjectIdHex } from "./id.js";
import { mapPgError } from "./errors.js";
import type { PublicUserRecord, TxContext, UserRecord, UserRepository } from "../types.js";

type Row = typeof users.$inferSelect;

function toRecord(r: Row): UserRecord {
  return {
    id: r.id, email: r.email, passwordHash: r.passwordHash, phone: r.phone,
    isVerified: r.isVerified, personalDetails: r.personalDetails,
    verificationTokenHash: r.verificationTokenHash,
    verificationTokenExpiresAt: r.verificationTokenExpiresAt,
    balance: r.balance, role: r.role as UserRecord["role"],
    createdAt: r.createdAt, updatedAt: r.updatedAt
  };
}

export const postgresUserRepository: UserRepository = {
  async findById(id, tx) {
    if (!isObjectIdHex(id)) return null;
    const [r] = await asPgTx(tx).select().from(users).where(eq(users.id, id)).limit(1);
    return r ? toRecord(r) : null;
  },
  async findByIdSafe(id, tx) {
    const rec = await this.findById(id, tx);
    if (!rec) return null;
    const { passwordHash, verificationTokenHash, ...safe } = rec;
    return safe as PublicUserRecord;
  },
  async findByEmail(email, tx) {
    const [r] = await asPgTx(tx).select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    return r ? toRecord(r) : null;
  },
  async findByEmails(emails, tx) {
    if (emails.length === 0) return [];
    const rows = await asPgTx(tx).select().from(users).where(inArray(users.email, emails));
    return rows.map(toRecord);
  },
  async findManyByIds(ids, tx) {
    const valid = ids.filter(isObjectIdHex);
    if (valid.length === 0) return [];
    const rows = await asPgTx(tx).select().from(users).where(inArray(users.id, valid));
    return rows.map(toRecord);
  },
  async create(input, tx) {
    const now = new Date();
    try {
      const [r] = await asPgTx(tx).insert(users).values({
        id: newObjectId(),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        phone: input.phone,
        isVerified: false,
        personalDetails: null,
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
        balance: input.balance,
        role: "user",
        createdAt: now, updatedAt: now
      }).returning();
      return toRecord(r);
    } catch (e) { mapPgError(e, "email"); }
  },
  async setBalance(id, balance, tx) {
    await asPgTx(tx).update(users).set({ balance, updatedAt: new Date() }).where(eq(users.id, id));
  },
  async setVerificationToken(id, hash, expiresAt, tx) {
    await asPgTx(tx).update(users).set({ verificationTokenHash: hash, verificationTokenExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(users.id, id));
  },
  async markVerified(id, tx) {
    await asPgTx(tx).update(users).set({ isVerified: true, verificationTokenHash: null, verificationTokenExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, id));
  },
  async setPersonalDetails(id, personalDetailsId, tx) {
    await asPgTx(tx).update(users).set({ personalDetails: personalDetailsId, updatedAt: new Date() }).where(eq(users.id, id));
  }
};
```

- [ ] **Step 3: Create `src/repositories/postgres/index.ts`** (stub the other 8 with
  `{} as XxxRepository` so it compiles; fill each in its task — mirror
  `mongo/index.ts`):

```ts
import type { Repositories } from "../types.js";
import { runInTransaction } from "./transaction.js";
import { postgresUserRepository } from "./user.repository.js";
// ...import the rest as they are implemented; until then:
import type { /* interfaces */ } from "../types.js";

export function createPostgresRepositories(/* db is read via getPgDb in helpers */): Repositories {
  return {
    users: postgresUserRepository,
    transactions: {} as Repositories["transactions"],
    personalDetails: {} as Repositories["personalDetails"],
    exchangeRates: {} as Repositories["exchangeRates"],
    aiConversations: {} as Repositories["aiConversations"],
    aiPendingTransfers: {} as Repositories["aiPendingTransfers"],
    aiAuditLogs: {} as Repositories["aiAuditLogs"],
    videoSessions: {} as Repositories["videoSessions"],
    videoAuditLogs: {} as Repositories["videoAuditLogs"],
    runInTransaction
  };
}
```

> Note: `createPostgresRepositories` takes the db implicitly via `getPgDb()` inside
> `asPgTx`; the harness calls it with the db already initialised. Keep the
> signature `createPostgresRepositories(_db?: PgDatabase)` for symmetry with the
> harness call, ignoring the arg.

- [ ] **Step 4:** Run `npm run test:contract -- --test-name-pattern="UserRepository"`
  → BOTH `[postgres]` and `[mongo]` PASS.

- [ ] **Step 5: Commit** `feat(pg): User postgres repository (parity green)`.

---

### Tasks 6–13: remaining Postgres repos (same shape as Task 5)

For each: add the entity's contract cases under `server/tests/contract/`, implement
the Postgres repo, wire it into `createPostgresRepositories`, and get both driver
blocks green. The trivial mapping/CRUD mirrors Task 5; below are the **non-obvious
bits** that must match the Mongo semantics exactly (each verbatim from the shipped
Mongo repo I reviewed).

- [ ] **Task 6 — Transaction.** SQL for the aggregates (use `drizzle-orm` `sql`):
  - `getRelationshipStats`: `SELECT COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE 0 END),0)::float8 AS "totalSent", COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE 0 END),0)::float8 AS "totalReceived", COUNT(*)::int AS "transactionCount", MAX(created_at) AS "lastTransactionAt" FROM transactions WHERE owner_id=$1 AND counterparty_email=$2` → map `lastTransactionAt ?? null`.
  - `getDirectionalTotals`: `... SUM(amount), COUNT(*) ... GROUP BY type` → fold into `{creditTotal,creditCount,debitTotal,debitCount}` (default 0).
  - `getDailyDebitUsage`: `SELECT COALESCE(SUM(amount),0)::float8 total, COUNT(*)::int count FROM transactions WHERE owner_id=$1 AND type='debit' AND created_at >= $2 AND created_at < $3`.
  - `listForOwner`: `find` + `count(*)` (two queries, like Mongo's `Promise.all`), `ORDER BY created_at DESC`, `OFFSET (page-1)*limit LIMIT limit`.
  - `listForOwnerFiltered`: build `WHERE` from criteria — `type`, `counterparty_email`, `created_at >= dateFrom`, `created_at < dateTo`, `amount >= minAmount`, `amount <= maxAmount`, and `reason ILIKE '%'||$x||'%'` with `%`,`_`,`\` escaped (`ESCAPE '\'`); `ORDER BY` from `TransactionListSort` (`newest`→`created_at DESC`, `oldest`→`created_at ASC`, `amount_desc`→`amount DESC`, `amount_asc`→`amount ASC`); `LIMIT`.
  - `recentForOwner`/`lastForOwner` (limit 1)/`recentWithCounterparty`: `ORDER BY created_at DESC LIMIT`.
  - `hasDebitToCounterparty`: `SELECT EXISTS(... type='debit')`.
  - `findByIdForOwner`: `isObjectIdHex` guard → null; `WHERE id=$ AND owner_id=$`.
  - `createMany`: `insert(...).values(rows).returning()` preserving array order; assign each `id: newObjectId()`.
  - Contract cases: assert `getRelationshipStats` zero-defaults on empty; totals math on a seeded set; `reasonContains` is case-insensitive; date-window boundaries (`>= from`, `< to`); sort orders.

- [ ] **Task 7 — PersonalDetails.**
  - `ensureForUser`: `INSERT ... (id,user_id,status,address,created_at,updated_at) VALUES (newObjectId(),$1,'not_provided','{}'::jsonb,now,now) ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING *` (the no-op `DO UPDATE` guarantees a returned row, matching Mongo's upsert+new).
  - `update`: `UPDATE ... SET <patch>, updated_at=now WHERE user_id=$ RETURNING *`; **return null when no row** (Mongo returns null → service maps to 404).
  - `findProvidedByUserIds`: `WHERE user_id = ANY($ids) AND status='provided'`.
  - `findProvidedByName`: `WHERE status='provided' AND lower(first_name)=lower($1)` and, when `lastName` non-empty, `AND lower(last_name)=lower($2)`; `LIMIT`.
  - `address` round-trips as `jsonb` object.

- [ ] **Task 8 — ExchangeRate.**
  - `latestForBase`: `WHERE base_currency=$ ORDER BY fetched_at DESC LIMIT 1`.
  - `findForDate`: `WHERE base_currency=$ AND valid_for_date=$ ORDER BY fetched_at DESC LIMIT 1`.
  - `upsertForDate`: `INSERT ... ON CONFLICT (base_currency, valid_for_date) DO UPDATE SET rates=EXCLUDED.rates, provider=EXCLUDED.provider, fetched_at=EXCLUDED.fetched_at, expires_at=EXCLUDED.expires_at, source_response_hash=EXCLUDED.source_response_hash, updated_at=now RETURNING *`. `rates` is `jsonb`.

- [ ] **Task 9 — AiConversation.**
  - `findByConversationId`: `WHERE user_id=$ AND conversation_id=$`.
  - `upsert`: `INSERT ... ON CONFLICT (user_id, conversation_id) DO UPDATE SET assistant_id=EXCLUDED.assistant_id, messages=EXCLUDED.messages, memory=EXCLUDED.memory, expires_at=EXCLUDED.expires_at, updated_at=now RETURNING *`. `messages` (array) and `memory` (object) are `jsonb`.

- [ ] **Task 10 — AiPendingTransfer** (the trickiest).
  - `toRecord`: `idempotencyResults` is already a plain object from `jsonb` (no Map).
  - `findById`/`findActivePendingForUser`: `isObjectIdHex` guard → null. Active = `status='pending' AND expires_at > now()`.
  - `findActiveForConversation`: `WHERE user_id=$ AND conversation_id=$ AND status='pending' AND expires_at > now()`.
  - `listActivePendingForUser`: `WHERE user_id=$ AND status='pending' AND expires_at > now() [AND conversation_id=$] ORDER BY created_at DESC LIMIT`.
  - `create`: insert with `id: newObjectId()`.
  - `updateStatus` (conditional): build `WHERE id=$ [AND user_id=$][AND version=$][AND status=expectedStatus][AND expires_at > now()]`; `SET status=$, updated_at=now [, superseded_by_id=$] [, idempotency_results = jsonb_set(idempotency_results, '{<key>}', $::jsonb, true)]`; `RETURNING *`; **return null when 0 rows updated** (maps to 409). Quote/escape the jsonb path key safely (it is an internal idempotency key, but still parameterize the value; the path uses Drizzle `sql` with the key as a bound literal in the `{}` text — validate the key matches `^[A-Za-z0-9._:-]+$` and reject otherwise).
  - `setIdempotencyResult`: `UPDATE ... SET idempotency_results = jsonb_set(idempotency_results, '{<key>}', $::jsonb, true), updated_at=now WHERE id=$`.
  - Contract cases: guard mismatch (wrong `version`/`expectedStatus`/expired) returns null and does NOT change status; idempotency key write is visible on the returned record.

- [ ] **Task 11 — AiAuditLog.** `create` only. `tools_requested`/`tools_executed`
  are `text[]`; `diagnostics` is `jsonb`. Default empties match the schema defaults.

- [ ] **Task 12 — VideoSession.**
  - `findById`/`update`: `isObjectIdHex` guard. `update` returns null when missing.
  - `create`: insert with `metadata` jsonb; nullable timestamp fields default null.
  - `listForUser`: `WHERE user_id=$ ORDER BY created_at DESC`.
  - `listForAgentQueue`: `WHERE type = ANY($types) [AND status=$] ORDER BY created_at DESC LIMIT`.

- [ ] **Task 13 — VideoAuditLog.** `create` only; `details` is `jsonb`.

After each: `npm run test:contract -- --test-name-pattern="<Entity>"` → both drivers
green; commit `feat(pg): <Entity> postgres repository (parity green)`.

When all are done, remove the stubs from `createPostgresRepositories` so it returns
all 9 real repos.

---

## Stage D — Wiring, TTL, sync, cutover

### Task 14: Wire the postgres driver into the registry + boot

**Files:**
- Modify: `src/repositories/registry.ts`, `src/db.ts`, `src/index.ts`
- Test: `src/repositories/registry.test.ts` (extend)

- [ ] **Step 1:** Add a failing test: `createRepositories("postgres")` returns an
  object whose `users.findById` is a function (no longer throws). (Run with
  `VIRLY_POSTGRES_URL` set so `getPgDb` can build lazily; the repos don't query at
  construction.)

- [ ] **Step 2:** Implement the registry branch:

```ts
// src/repositories/registry.ts
import type { Repositories } from "./types.js";
import { createMongoRepositories } from "./mongo/index.js";
import { createPostgresRepositories } from "./postgres/index.js";

export function createRepositories(driver: "mongo" | "postgres"): Repositories {
  if (driver === "mongo") return createMongoRepositories();
  if (driver === "postgres") return createPostgresRepositories();
  throw new Error(`Unknown driver "${driver}".`);
}
```

- [ ] **Step 3:** In `src/db.ts`, initialise + migrate Postgres before building repos:

```ts
import { getPgDb, runPgMigrations } from "./db/postgres.js";

export async function initRepositories(): Promise<void> {
  if (config.dbDriver === "postgres") {
    getPgDb();
    await runPgMigrations();
  }
  setRepositories(createRepositories(config.dbDriver));
}
```

In `src/index.ts`, `await initRepositories();` (it is now async). `connectDb()`
stays unconditional — Mongo is always connected for the LangGraph checkpointer/store
(the documented Phase-1 hybrid), even in postgres mode.

- [ ] **Step 4:** `npm test` green; commit `feat(pg): select postgres driver at boot`.

---

### Task 15: TTL sweeper (postgres mode)

**Files:**
- Create: `src/ttl/sweeper.ts`, `src/ttl/sweeper.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1:** Failing unit test: `sweepExpired(fakeDb, now)` issues a delete on
  `ai_conversations` and `ai_pending_transfers` filtered by `expires_at < now`
  (assert against a fake db that records calls).

- [ ] **Step 2:** Implement:

```ts
// src/ttl/sweeper.ts
import { lt } from "drizzle-orm";
import { aiConversations, aiPendingTransfers } from "../repositories/postgres/schema.js";
import { getPgDb } from "../db/postgres.js";

export async function sweepExpired(db = getPgDb(), now = new Date()): Promise<void> {
  await db.delete(aiConversations).where(lt(aiConversations.expiresAt, now));
  await db.delete(aiPendingTransfers).where(lt(aiPendingTransfers.expiresAt, now));
}

let timer: NodeJS.Timeout | null = null;
export function startTtlSweeper(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(() => { void sweepExpired().catch((e) => console.error("ttl sweep failed", e)); }, intervalMs);
  timer.unref();
}
```

- [ ] **Step 3:** In `src/index.ts` bootstrap, after `initRepositories()`:
  `if (config.dbDriver === "postgres") startTtlSweeper();`

- [ ] **Step 4:** `npm test` green; (optional) a contract case asserting
  `findActiveForConversation` excludes an expired row regardless of sweeper, since
  active queries already filter `expires_at > now()`. Commit
  `feat(pg): TTL sweeper replaces mongo TTL indexes`.

---

### Task 16: Sync + verify scripts

**Files:**
- Create: `server/scripts/sync-mongo-to-postgres.ts`,
  `server/scripts/sync-postgres-to-mongo.ts`, `server/scripts/verify-parity.ts`

These live outside `src/`, so they may import Mongoose models **and** Drizzle
schema directly (migration infra; not covered by the seam guard).

- [ ] **Step 1 (`sync-mongo-to-postgres.ts`):** for each of the 9 collections:
  read all docs via the Mongoose model (`.lean()`), transform `_id`→`id` (string)
  and every ObjectId FK→string, coerce `Map`→object (idempotencyResults), keep
  JSON fields as-is, then `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` into the
  Drizzle table (idempotent, re-runnable). Preserve `createdAt`/`updatedAt`.
  Process in FK-safe order (users → personal_details → transactions → … ). Connect
  Mongo via `config.mongoUri`, Postgres via `getPgDb()` + `runPgMigrations()`.

- [ ] **Step 2 (`sync-postgres-to-mongo.ts`):** the reverse — read each Drizzle
  table, map `id`→`_id`, FK strings→`ObjectId`, then `bulkWrite` upserts
  (`updateOne` with `upsert:true` keyed on `_id`) into the Mongoose model.

- [ ] **Step 3 (`verify-parity.ts`):** for each collection compare `count` on both
  sides and a stable checksum (sort by id, canonicalise dates to ISO + JSON fields
  with sorted keys, sha256). Print a per-collection table; `process.exit(1)` on any
  mismatch.

- [ ] **Step 4:** Manual run against the test compose (documented), then commit
  `feat(pg): mongo<->postgres sync and parity-verify scripts`.

---

### Task 17: Config docs, cutover runbook, final verification

**Files:**
- Modify: `.env.example`, `README.md`

- [ ] **Step 1:** Document env (`VIRLY_DB_DRIVER` default `mongo`,
  `VIRLY_POSTGRES_URL`) and add to `.env.example`.

- [ ] **Step 2:** Add the cutover/rollback runbook to `README.md`:
  - Forward: provision PG → `npm run db:migrate` → (window) `tsx scripts/sync-mongo-to-postgres.ts` → `tsx scripts/verify-parity.ts` → set `VIRLY_DB_DRIVER=postgres` → restart.
  - Rollback: (window) `tsx scripts/sync-postgres-to-mongo.ts` → `verify-parity` → set `VIRLY_DB_DRIVER=mongo` → restart. LangGraph unaffected (always Mongo).

- [ ] **Step 3: Full verification (evidence before claiming done):**
  - `npm test` (DB-less) → green; `npm run build` → clean.
  - `docker compose -f docker-compose.test.yml up -d` then
    `CONTRACT_PG_URL=... CONTRACT_MONGO_URL=... npm run test:contract` →
    every entity green on **both** `[postgres]` and `[mongo]`.
  - End-to-end smoke: with `VIRLY_DB_DRIVER=postgres` (PG migrated + synced), boot
    the server and exercise signup → verify → login → transfer → AI read tool, and
    confirm behaviour matches Mongo mode.

- [ ] **Step 4: Commit** `docs(pg): env + cutover runbook; complete Phase 1`.

---

## Done criteria for Plan 2

- `npm test` (no DB) green; `npm run build` clean.
- `npm run test:contract` green for all 9 entities on **both** drivers.
- `createRepositories("postgres")` returns a full, working `Repositories`.
- With `VIRLY_DB_DRIVER=postgres` the app runs end-to-end; flipping back to `mongo`
  restores the original path. LangGraph stays on Mongo in both modes.
- `verify-parity` reports zero mismatches after a sync.

**Phase 2 (separate spec/plan):** move the LangGraph checkpointer/store to
`@langchain/langgraph-checkpoint-postgres`, drop the always-on Mongo connection,
and (optionally) harden money columns to `numeric` + tighten transaction isolation.
```
