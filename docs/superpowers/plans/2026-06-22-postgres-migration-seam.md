# Repository Seam (Phase 1, Plan 1 of 2) Implementation Plan

> **✅ Completed — shipped to `main` via PR #1.** Every task below has landed:
> `server/src/repositories/` (types, registry, boot singleton, and the Mongo
> implementations) exists, consumers use `getRepositories()` instead of models,
> and the `no-direct-model-imports.test.ts` guard is green. The unchecked
> checkboxes below are the original execution tracker and are kept as a record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every database access in `server/` through a repository
abstraction with a Mongo (Mongoose) implementation and a driver-neutral
transaction wrapper, so the database becomes swappable — **with byte-for-byte
identical API behaviour, still running on MongoDB**.

**Architecture:** A `Repositories` interface (one repo per entity, returning plain
record POJOs) sits between services/AI-tools and the database. A registry builds
the implementation at boot from `config.dbDriver`. In this plan only the Mongo
implementation exists; `postgres` throws "not implemented" (Plan 2 adds it).
Multi-document transactions move behind `repos.runInTransaction(fn)`.

**Tech Stack:** Node ESM + TypeScript, Express, Mongoose 8, `node:test` + `tsx`.

**Design spec:** `docs/superpowers/specs/2026-06-22-postgres-migration-design.md`

## Global Constraints

- ESM: every relative import ends in `.js` (TypeScript `nodenext`).
- Test runner: `npm test` → `tsx --test "src/**/*.test.ts"`. Run from `server/`.
- IDs stay 24-hex ObjectId strings in records (`id: string`), never `_id`.
- Default `VIRLY_DB_DRIVER=mongo`; current behaviour must remain the default.
- No file **outside `src/repositories/mongo/`** may import from `../models/`
  by the end of this plan (enforced by Task 16).
- Records are plain objects: no Mongoose Documents, no `.save()`, no `.toObject()`
  leaking past a repository.
- TDD: write the failing test, watch it fail, implement, watch it pass, commit.
- All paths below are relative to `server/`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/config.ts` (modify) | Add `dbDriver`, `postgresUrl` with fail-fast validation. |
| `src/repositories/types.ts` (create) | Record types, repo interfaces, `Repositories`, `TxContext`, `DuplicateKeyError`. |
| `src/repositories/mongo/transaction.ts` (create) | `runInTransaction` over a Mongoose session; `asSession(tx)` helper. |
| `src/repositories/mongo/<entity>.repository.ts` (create ×9) | Mongoose-backed implementations + record mappers. |
| `src/repositories/mongo/index.ts` (create) | `createMongoRepositories()`. |
| `src/repositories/registry.ts` (create) | `createRepositories(driver)`. |
| `src/repositories/index.ts` (create) | `setRepositories`/`getRepositories` boot singleton. |
| `src/db.ts` / `src/index.ts` (modify) | Build + register repositories at boot. |
| Consumers (services, `utils/`, `ai/tools/`, routes, middleware) | Use `getRepositories()` instead of models. |

---

## Stage A — Foundation (no behaviour change)

### Task 1: Config flag

**Files:**
- Modify: `src/config.ts`
- Test: `src/config.dbDriver.test.ts`

**Interfaces:**
- Produces: `config.dbDriver: "mongo" | "postgres"`, `config.postgresUrl: string | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// src/config.dbDriver.test.ts
import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  // bust the module cache so config.ts re-evaluates with new env
  const mod = await import(`./config.js?ts=${Date.now()}`);
  process.env = prev;
  return mod.config as typeof import("./config.js").config;
}

test("dbDriver defaults to mongo", async () => {
  const config = await loadConfig({ VIRLY_DB_DRIVER: undefined });
  assert.equal(config.dbDriver, "mongo");
});

test("dbDriver=postgres requires VIRLY_POSTGRES_URL", async () => {
  await assert.rejects(
    () =>
      loadConfig({
        VIRLY_DB_DRIVER: "postgres",
        VIRLY_POSTGRES_URL: undefined
      }),
    /VIRLY_POSTGRES_URL/
  );
});

test("dbDriver=postgres accepts a postgres url", async () => {
  const config = await loadConfig({
    VIRLY_DB_DRIVER: "postgres",
    VIRLY_POSTGRES_URL: "postgres://localhost:5432/virly"
  });
  assert.equal(config.dbDriver, "postgres");
  assert.equal(config.postgresUrl, "postgres://localhost:5432/virly");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="dbDriver"`
Expected: FAIL — `config.dbDriver` is `undefined`.

- [ ] **Step 3: Implement in `src/config.ts`**

Add near the other resolvers (before the `export const config`):

```ts
function resolveDbDriver(): "mongo" | "postgres" {
  const raw = getStringEnv("VIRLY_DB_DRIVER", "mongo").trim().toLowerCase();
  if (raw !== "mongo" && raw !== "postgres") {
    throw new Error("VIRLY_DB_DRIVER must be one of: mongo, postgres.");
  }
  return raw;
}

const dbDriver = resolveDbDriver();
const postgresUrl = getOptionalStringEnv("VIRLY_POSTGRES_URL", {
  aliases: ["POSTGRES_URL", "DATABASE_URL"]
});

if (dbDriver === "postgres" && !postgresUrl) {
  throw new Error("VIRLY_POSTGRES_URL is required when VIRLY_DB_DRIVER=postgres.");
}
```

Then add to the `config` object literal:

```ts
  dbDriver,
  postgresUrl,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="dbDriver"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.dbDriver.test.ts
git commit -m "feat(db): add VIRLY_DB_DRIVER config flag"
```

---

### Task 2: Repository contracts (types + DuplicateKeyError)

**Files:**
- Create: `src/repositories/types.ts`
- Test: `src/repositories/types.test.ts`

**Interfaces:**
- Produces: `TxContext`, `DuplicateKeyError`, all `*Record` types, all `*Repository`
  interfaces, `Repositories`. Every later task consumes these.

- [ ] **Step 1: Write the failing test** (the only runtime-testable part is the error class; the interfaces are compile-time)

```ts
// src/repositories/types.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { DuplicateKeyError } from "./types.js";

test("DuplicateKeyError carries the conflicting key and is an Error", () => {
  const err = new DuplicateKeyError("email");
  assert.ok(err instanceof Error);
  assert.equal(err.key, "email");
  assert.match(err.message, /email/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="DuplicateKeyError"`
Expected: FAIL — cannot find module `./types.js`.

- [ ] **Step 3: Create `src/repositories/types.ts`**

```ts
import type { UserRole } from "../models/User.js";

/** Opaque per-driver transaction handle. Consumers pass it through; never inspect. */
export type TxContext = unknown;

/** Thrown by both driver impls on a unique-constraint violation. */
export class DuplicateKeyError extends Error {
  constructor(public readonly key: string) {
    super(`Duplicate value for unique key: ${key}`);
    this.name = "DuplicateKeyError";
  }
}

// ---- Records (plain POJOs; id is the 24-hex ObjectId string) -----------------

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  phone: string;
  isVerified: boolean;
  personalDetails: string | null;
  verificationTokenHash: string | null;
  verificationTokenExpiresAt: Date | null;
  balance: number;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};
export type PublicUserRecord = Omit<UserRecord, "passwordHash" | "verificationTokenHash">;

export type TransactionRecord = {
  id: string;
  ownerId: string;
  counterpartyEmail: string;
  amount: number;
  type: "credit" | "debit";
  directionLabel: string;
  reason: string | null;
  enteredCurrency?: "ILS" | "USD" | "EUR";
  enteredAmount?: number;
  exchangeRateUsed?: number;
  exchangeRateFetchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type PersonalDetailsRecord = {
  id: string;
  userId: string;
  status: "not_provided" | "provided";
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  address: Record<string, string | null>;
  lastSkippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExchangeRateRecord = {
  id: string;
  baseCurrency: string;
  rates: Record<string, number>;
  provider: string;
  fetchedAt: Date;
  validForDate: string;
  expiresAt: Date;
  sourceResponseHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiConversationRecord = {
  id: string;
  userId: string;
  conversationId: string;
  assistantId: string;
  messages: unknown[];
  memory: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AiPendingTransferRecord = {
  id: string;
  userId: string;
  conversationId: string;
  assistantId: string;
  recipientEmail: string;
  version: number;
  currency: "ILS";
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  reason: string | null;
  status: "pending" | "confirmed" | "denied" | "expired" | "superseded";
  supersededById: string | null;
  supersedesId: string | null;
  idempotencyResults: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AiAuditLogRecord = {
  id: string;
  userId: string;
  conversationId: string;
  requestId: string | null;
  assistantId: string;
  intent: string;
  toolsRequested: string[];
  toolsExecuted: string[];
  refusalReason: string | null;
  diagnostics: unknown[];
  createdAt: Date;
  updatedAt: Date;
};

export type VideoSessionRecord = {
  id: string;
  userId: string;
  assignedAgentId: string | null;
  type: "support" | "sales";
  status: "requested" | "waiting_for_agent" | "active" | "ended" | "missed" | "cancelled" | "failed";
  roomName: string;
  provider: string;
  topic: string | null;
  userProblemSummary: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  userJoinedAt: Date | null;
  agentJoinedAt: Date | null;
  metadata: { userAgent: string | null; locale: string | null; source: string };
  createdAt: Date;
  updatedAt: Date;
};

export type VideoAuditLogRecord = {
  id: string;
  event: string;
  actorId: string;
  actorRole: UserRole;
  targetUserId: string;
  videoSessionId: string;
  sessionType: "support" | "sales";
  result: "success" | "failure";
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

// ---- Repository interfaces ----------------------------------------------------
// NOTE to implementer: each interface below lists ONLY the methods used by a
// current call site. When refactoring a consumer (Stage B), if you find a usage
// not covered here, ADD the method to the interface AND both nothing-else — keep
// the set minimal (YAGNI). The signatures here are the contract Plan 2's Postgres
// impl must satisfy.

export interface UserRepository {
  findById(id: string, tx?: TxContext): Promise<UserRecord | null>;
  findByIdSafe(id: string, tx?: TxContext): Promise<PublicUserRecord | null>;
  findByEmail(email: string, tx?: TxContext): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    phone: string;
    balance: number;
  }, tx?: TxContext): Promise<UserRecord>;
  setBalance(id: string, balance: number, tx?: TxContext): Promise<void>;
  setVerificationToken(id: string, hash: string | null, expiresAt: Date | null, tx?: TxContext): Promise<void>;
  markVerified(id: string, tx?: TxContext): Promise<void>;
}

export interface TransactionRepository {
  createMany(entries: Array<Omit<TransactionRecord, "id" | "createdAt" | "updatedAt">>, tx?: TxContext): Promise<TransactionRecord[]>;
  listForOwner(input: { ownerId: string; counterpartyEmail?: string; page: number; limit: number }, tx?: TxContext): Promise<{ transactions: TransactionRecord[]; total: number }>;
  recentWithCounterparty(input: { ownerId: string; counterpartyEmail: string; limit: number }, tx?: TxContext): Promise<TransactionRecord[]>;
  getRelationshipStats(input: { ownerId: string; counterpartyEmail: string }, tx?: TxContext): Promise<{ totalSent: number; totalReceived: number; transactionCount: number; lastTransactionAt: Date | null }>;
  getDirectionalTotals(input: { ownerId: string; counterpartyEmail: string }, tx?: TxContext): Promise<{ creditTotal: number; creditCount: number; debitTotal: number; debitCount: number }>;
  sumSameDayDebits(input: { ownerId: string; dayStart: Date; dayEnd: Date }, tx?: TxContext): Promise<number>;
  // Stage B adds further read methods required by ai/tools/* (e.g. listRecent,
  // countByType). Add them here as each tool is refactored.
}

export interface PersonalDetailsRepository {
  findByUserId(userId: string, tx?: TxContext): Promise<PersonalDetailsRecord | null>;
  ensureForUser(userId: string, tx?: TxContext): Promise<PersonalDetailsRecord>;
  update(userId: string, patch: Partial<Omit<PersonalDetailsRecord, "id" | "userId" | "createdAt" | "updatedAt">>, tx?: TxContext): Promise<PersonalDetailsRecord>;
}

export interface ExchangeRateRepository {
  latestForBase(baseCurrency: string, tx?: TxContext): Promise<ExchangeRateRecord | null>;
  findForDate(baseCurrency: string, validForDate: string, tx?: TxContext): Promise<ExchangeRateRecord | null>;
  upsertForDate(record: Omit<ExchangeRateRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<ExchangeRateRecord>;
}

export interface AiConversationRepository {
  findByConversationId(userId: string, conversationId: string, tx?: TxContext): Promise<AiConversationRecord | null>;
  upsert(record: Omit<AiConversationRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<AiConversationRecord>;
}

export interface AiPendingTransferRepository {
  findById(id: string, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  findActiveForConversation(userId: string, conversationId: string, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  create(input: Omit<AiPendingTransferRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<AiPendingTransferRecord>;
  updateStatus(id: string, status: AiPendingTransferRecord["status"], patch?: Partial<AiPendingTransferRecord>, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  setIdempotencyResult(id: string, key: string, value: unknown, tx?: TxContext): Promise<void>;
}

export interface AiAuditLogRepository {
  create(input: Omit<AiAuditLogRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<AiAuditLogRecord>;
}

export interface VideoSessionRepository {
  findById(id: string, tx?: TxContext): Promise<VideoSessionRecord | null>;
  findByRoomName(roomName: string, tx?: TxContext): Promise<VideoSessionRecord | null>;
  create(input: Omit<VideoSessionRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<VideoSessionRecord>;
  update(id: string, patch: Partial<VideoSessionRecord>, tx?: TxContext): Promise<VideoSessionRecord | null>;
  listForUser(userId: string, tx?: TxContext): Promise<VideoSessionRecord[]>;
  listActiveForType(type: VideoSessionRecord["type"], tx?: TxContext): Promise<VideoSessionRecord[]>;
}

export interface VideoAuditLogRepository {
  create(input: Omit<VideoAuditLogRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<VideoAuditLogRecord>;
}

export interface Repositories {
  users: UserRepository;
  transactions: TransactionRepository;
  personalDetails: PersonalDetailsRepository;
  exchangeRates: ExchangeRateRepository;
  aiConversations: AiConversationRepository;
  aiPendingTransfers: AiPendingTransferRepository;
  aiAuditLogs: AiAuditLogRepository;
  videoSessions: VideoSessionRepository;
  videoAuditLogs: VideoAuditLogRepository;
  runInTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="DuplicateKeyError"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/types.ts src/repositories/types.test.ts
git commit -m "feat(db): define repository contracts and record types"
```

---

### Task 3: Mongo transaction runner + registry + boot singleton

**Files:**
- Create: `src/repositories/mongo/transaction.ts`, `src/repositories/mongo/index.ts`,
  `src/repositories/registry.ts`, `src/repositories/index.ts`
- Test: `src/repositories/registry.test.ts`

**Interfaces:**
- Consumes: `Repositories` (Task 2).
- Produces: `createMongoRepositories()`, `createRepositories(driver)`,
  `setRepositories(r)`, `getRepositories()`, `runInTransaction`, `asSession(tx)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/repositories/registry.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories } from "./registry.js";
import { getRepositories, setRepositories } from "./index.js";

test("createRepositories('mongo') returns a full Repositories object", () => {
  const repos = createRepositories("mongo");
  assert.equal(typeof repos.users.findById, "function");
  assert.equal(typeof repos.runInTransaction, "function");
});

test("createRepositories('postgres') throws until Plan 2", () => {
  assert.throws(() => createRepositories("postgres"), /not implemented/i);
});

test("getRepositories throws before setRepositories", async () => {
  const fresh = await import(`./index.js?ts=${Date.now()}`);
  assert.throws(() => fresh.getRepositories(), /not initialised/i);
});

test("setRepositories then getRepositories returns the instance", () => {
  const repos = createRepositories("mongo");
  setRepositories(repos);
  assert.equal(getRepositories(), repos);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="Repositories"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// src/repositories/mongo/transaction.ts
import mongoose, { type ClientSession } from "mongoose";
import type { TxContext } from "../types.js";

/** Narrow an opaque TxContext to a Mongoose session (or undefined). */
export function asSession(tx?: TxContext): ClientSession | undefined {
  return (tx as ClientSession | undefined) ?? undefined;
}

export async function runInTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    let ran = false;
    await session.withTransaction(async () => {
      result = await fn(session);
      ran = true;
    });
    if (!ran) throw new Error("Transaction body did not run.");
    return result as T;
  } finally {
    await session.endSession();
  }
}
```

```ts
// src/repositories/mongo/index.ts
import type { Repositories } from "../types.js";
import { runInTransaction } from "./transaction.js";
import { mongoUserRepository } from "./user.repository.js";
import { mongoTransactionRepository } from "./transaction.repository.js";
import { mongoPersonalDetailsRepository } from "./personalDetails.repository.js";
import { mongoExchangeRateRepository } from "./exchangeRate.repository.js";
import { mongoAiConversationRepository } from "./aiConversation.repository.js";
import { mongoAiPendingTransferRepository } from "./aiPendingTransfer.repository.js";
import { mongoAiAuditLogRepository } from "./aiAuditLog.repository.js";
import { mongoVideoSessionRepository } from "./videoSession.repository.js";
import { mongoVideoAuditLogRepository } from "./videoAuditLog.repository.js";

export function createMongoRepositories(): Repositories {
  return {
    users: mongoUserRepository,
    transactions: mongoTransactionRepository,
    personalDetails: mongoPersonalDetailsRepository,
    exchangeRates: mongoExchangeRateRepository,
    aiConversations: mongoAiConversationRepository,
    aiPendingTransfers: mongoAiPendingTransferRepository,
    aiAuditLogs: mongoAiAuditLogRepository,
    videoSessions: mongoVideoSessionRepository,
    videoAuditLogs: mongoVideoAuditLogRepository,
    runInTransaction
  };
}
```

> Implementer note: Task 3 only needs the *registry wiring* to compile and pass.
> Create each `mongo/<entity>.repository.ts` as a minimal stub exporting the
> named const (e.g. `export const mongoUserRepository = {} as UserRepository;`)
> so this task compiles; Stage B fills each one in with real code + its own
> contract test. Replace the stub in the entity's task.

```ts
// src/repositories/registry.ts
import type { Repositories } from "./types.js";
import { createMongoRepositories } from "./mongo/index.js";

export function createRepositories(driver: "mongo" | "postgres"): Repositories {
  if (driver === "mongo") return createMongoRepositories();
  throw new Error(`Driver "${driver}" not implemented yet (added in Plan 2).`);
}
```

```ts
// src/repositories/index.ts
import type { Repositories } from "./types.js";

let instance: Repositories | null = null;

export function setRepositories(repos: Repositories): void {
  instance = repos;
}

export function getRepositories(): Repositories {
  if (!instance) throw new Error("Repositories not initialised. Call setRepositories at boot.");
  return instance;
}

export * from "./types.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="Repositories"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/
git commit -m "feat(db): repository registry, boot singleton, mongo tx runner"
```

---

### Task 4: Boot wiring

**Files:**
- Modify: `src/db.ts`, `src/index.ts`
- Test: `src/db.boot.test.ts`

**Interfaces:**
- Consumes: `createRepositories`, `setRepositories`, `config.dbDriver`.

- [ ] **Step 1: Write the failing test**

```ts
// src/db.boot.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { initRepositories } from "./db.js";
import { getRepositories } from "./repositories/index.js";

test("initRepositories registers the mongo driver repositories", () => {
  initRepositories();
  assert.equal(typeof getRepositories().users.findById, "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="initRepositories"`
Expected: FAIL — `initRepositories` is not exported.

- [ ] **Step 3: Implement**

In `src/db.ts` add (keep `connectDb` unchanged):

```ts
import { config } from "./config.js";
import { createRepositories } from "./repositories/registry.js";
import { setRepositories } from "./repositories/index.js";

/** Build the driver's repositories and register them as the process singleton. */
export function initRepositories(): void {
  setRepositories(createRepositories(config.dbDriver));
}
```

In `src/index.ts`, call it during `bootstrap()` after `connectDb()`:

```ts
import { connectDb, initRepositories } from "./db.js";
// ...
  await connectDb();
  initRepositories();
  startDailyFxRefresh();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="initRepositories"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/index.ts src/db.boot.test.ts
git commit -m "feat(db): build repositories at boot from driver flag"
```

---

## Stage B — Per-entity Mongo repo + consumer refactor

Each task below: (a) replace the entity's stub with a real Mongo repo + a contract
test that monkey-patches the Mongoose model exactly like today's service tests,
(b) refactor that entity's consumers to use `getRepositories()`, (c) rewrite the
affected service test to mock the **repository** instead of the model. After each
task the **full suite must be green** (`npm test`).

### Task 5: User entity (reference implementation — full code)

**Files:**
- Create: `src/repositories/mongo/user.repository.ts`, `src/repositories/mongo/user.repository.test.ts`
- Modify: `src/services/account.service.ts`, `src/services/auth.service.ts`,
  `src/middleware/roles.ts`, `src/utils/user-profile-dto.ts`
- Rewrite: `src/account.service.test.ts`

**Interfaces:**
- Consumes: `UserRepository`, `UserRecord`, `PublicUserRecord`, `DuplicateKeyError`, `asSession`.
- Produces: `mongoUserRepository`. Consumers call `getRepositories().users`.

- [ ] **Step 1: Write the failing repo contract test**

```ts
// src/repositories/mongo/user.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { User } from "../../models/User.js";
import { mongoUserRepository } from "./user.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k]; o[k] = v; t.after(() => { o[k] = orig; });
}

const ID = "507f1f77bcf86cd799439011";
const lean = {
  _id: ID, email: "a@b.com", passwordHash: "h", phone: "+972", isVerified: true,
  personalDetails: null, verificationTokenHash: null, verificationTokenExpiresAt: null,
  balance: 100, role: "user", createdAt: new Date(0), updatedAt: new Date(0)
};

test("findById maps a lean doc to a UserRecord with string id", async (t) => {
  patch(User, "findById", ((id: string) => ({ lean: async () => (id === ID ? lean : null) })) as never, t);
  const rec = await mongoUserRepository.findById(ID);
  assert.equal(rec?.id, ID);
  assert.equal(rec?.balance, 100);
  assert.equal((rec as Record<string, unknown>)._id, undefined);
});

test("findByIdSafe omits secret fields", async (t) => {
  patch(User, "findById", (() => ({ lean: async () => lean })) as never, t);
  const rec = await mongoUserRepository.findByIdSafe(ID);
  assert.equal((rec as Record<string, unknown>).passwordHash, undefined);
  assert.equal((rec as Record<string, unknown>).verificationTokenHash, undefined);
  assert.equal(rec?.email, "a@b.com");
});

test("create maps a duplicate-key (E11000) to DuplicateKeyError", async (t) => {
  patch(User, "create", (async () => { const e = new Error("dup") as Error & { code: number }; e.code = 11000; throw e; }) as never, t);
  await assert.rejects(
    () => mongoUserRepository.create({ email: "a@b.com", passwordHash: "h", phone: "+972", balance: 0 }),
    (e: unknown) => (e as Error).name === "DuplicateKeyError"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="findById maps"`
Expected: FAIL — stub `mongoUserRepository` has no `findById`.

- [ ] **Step 3: Implement `src/repositories/mongo/user.repository.ts`**

```ts
import { User } from "../../models/User.js";
import { asSession } from "./transaction.js";
import {
  DuplicateKeyError,
  type PublicUserRecord,
  type TxContext,
  type UserRecord,
  type UserRepository
} from "../types.js";

type Lean = Record<string, unknown> & { _id: unknown };

function toRecord(d: Lean): UserRecord {
  return {
    id: String(d._id),
    email: d.email as string,
    passwordHash: d.passwordHash as string,
    phone: d.phone as string,
    isVerified: Boolean(d.isVerified),
    personalDetails: d.personalDetails ? String(d.personalDetails) : null,
    verificationTokenHash: (d.verificationTokenHash as string | null) ?? null,
    verificationTokenExpiresAt: (d.verificationTokenExpiresAt as Date | null) ?? null,
    balance: d.balance as number,
    role: d.role as UserRecord["role"],
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

function isDup(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { code?: number }).code === 11000);
}

export const mongoUserRepository: UserRepository = {
  async findById(id, tx) {
    const d = await User.findById(id).session(asSession(tx) ?? null).lean();
    return d ? toRecord(d as Lean) : null;
  },
  async findByIdSafe(id, tx) {
    const rec = await this.findById(id, tx);
    if (!rec) return null;
    const { passwordHash, verificationTokenHash, ...safe } = rec;
    return safe as PublicUserRecord;
  },
  async findByEmail(email, tx) {
    const d = await User.findOne({ email: email.trim().toLowerCase() }).session(asSession(tx) ?? null).lean();
    return d ? toRecord(d as Lean) : null;
  },
  async create(input, tx) {
    try {
      const [doc] = await User.create([{ ...input, balance: input.balance }], { session: asSession(tx) });
      return toRecord(doc.toObject() as Lean);
    } catch (e) {
      if (isDup(e)) throw new DuplicateKeyError("email");
      throw e;
    }
  },
  async setBalance(id, balance, tx) {
    await User.updateOne({ _id: id }, { $set: { balance } }, { session: asSession(tx) });
  },
  async setVerificationToken(id, hash, expiresAt, tx) {
    await User.updateOne({ _id: id }, { $set: { verificationTokenHash: hash, verificationTokenExpiresAt: expiresAt } }, { session: asSession(tx) });
  },
  async markVerified(id, tx) {
    await User.updateOne({ _id: id }, { $set: { isVerified: true, verificationTokenHash: null, verificationTokenExpiresAt: null } }, { session: asSession(tx) });
  }
};
```

(`findById` here returns `findById(id).lean()`; the test patches `User.findById`
to return an object with a `.lean()` method — keep the impl's chain matching.
The `.session(... ?? null)` is harmless when no tx.)

- [ ] **Step 4: Refactor consumers**

`account.service.ts` — replace model use with the repo and return records:

```ts
import { getRepositories } from "../repositories/index.js";
import type { PublicUserRecord, UserRecord } from "../repositories/types.js";
import { AppError } from "../utils/app-error.js";

export type { UserRecord };

export const accountService = {
  async getById(userId: string): Promise<PublicUserRecord> {
    const user = await getRepositories().users.findByIdSafe(userId);
    if (!user) throw new AppError(404, "Account not found.");
    return user;
  },
  findById: (id: string) => getRepositories().users.findById(id),
  findByEmail: (email: string) => getRepositories().users.findByEmail(email),
  async findByIdOrEmail(identifier: string): Promise<UserRecord | null> {
    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (objectIdPattern.test(identifier)) return getRepositories().users.findById(identifier);
    const email = identifier.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
    return getRepositories().users.findByEmail(email);
  },
  create: (input: { email: string; passwordHash: string; phone: string; balance: number }) =>
    getRepositories().users.create(input)
};
```

`auth.service.ts` — `user.save()` patterns become repo calls. Replace
`sendNewVerificationLink(user)` body's `user.save()` with
`await repos.users.setVerificationToken(user.id, hash, expiry)`; in `verifyEmail`
replace the final `user.save()` with `await repos.users.markVerified(user.id)`.
The duplicate-email guard stays (`findByEmail` then `AppError(409)`), now backed
by the repo. `UserDocument` type imports become `UserRecord`.

`middleware/roles.ts` — replace `User.findById(...)` with `getRepositories().users.findByIdSafe(...)` (it only reads `role`/`id`).

`utils/user-profile-dto.ts` — read `record.id`/plain fields instead of `doc._id`/`.toObject()`.

- [ ] **Step 5: Rewrite `src/account.service.test.ts`**

Replace the `patchModel(User, ...)` helpers with a repo mock:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "./utils/app-error.js";
import { accountService } from "./services/account.service.js";
import { setRepositories } from "./repositories/index.js";
import { createMongoRepositories } from "./repositories/mongo/index.js";
import type { Repositories } from "./repositories/types.js";

function withUsers(stub: Partial<Repositories["users"]>) {
  const base = createMongoRepositories();
  setRepositories({ ...base, users: { ...base.users, ...stub } as Repositories["users"] });
}

const ID = "507f1f77bcf86cd799439011";
const rec = { id: ID, email: "alice@example.com", phone: "+972", isVerified: true, personalDetails: null, balance: 500, role: "user", createdAt: new Date(0), updatedAt: new Date(0) };

test("getById returns the safe record", async () => {
  withUsers({ findByIdSafe: async (id) => (id === ID ? (rec as never) : null) });
  const user = await accountService.getById(ID);
  assert.equal(user.id, ID);
  assert.equal((user as Record<string, unknown>).passwordHash, undefined);
});

test("getById throws AppError(404) when missing", async () => {
  withUsers({ findByIdSafe: async () => null });
  await assert.rejects(() => accountService.getById(ID), (e: unknown) => e instanceof AppError && (e as AppError).status === 404);
});

test("findByIdOrEmail resolves a 24-hex id via findById", async () => {
  withUsers({ findById: async (id) => (id === ID ? (rec as never) : null), findByEmail: async () => null });
  assert.equal((await accountService.findByIdOrEmail(ID))?.id, ID);
});

test("findByIdOrEmail resolves an email via findByEmail", async () => {
  withUsers({ findById: async () => null, findByEmail: async (e) => (e === "alice@example.com" ? (rec as never) : null) });
  assert.equal((await accountService.findByIdOrEmail("alice@example.com"))?.email, "alice@example.com");
});

test("findByIdOrEmail returns null for an invalid identifier", async () => {
  withUsers({ findById: async () => null, findByEmail: async () => null });
  assert.equal(await accountService.findByIdOrEmail("not-anything"), null);
});
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS (new repo test + rewritten account.service test + everything else green).

- [ ] **Step 7: Commit**

```bash
git add src/repositories/mongo/user.repository.ts src/repositories/mongo/user.repository.test.ts src/services/account.service.ts src/services/auth.service.ts src/middleware/roles.ts src/utils/user-profile-dto.ts src/account.service.test.ts
git commit -m "refactor(db): route User access through repository seam"
```

---

### Tasks 6–13: remaining entities (same shape as Task 5)

Each follows Task 5's structure exactly — repo contract test (monkey-patch the
model), real Mongo repo (`toRecord` mapper + `asSession(tx)` on every query),
consumer refactor, service-test rewrite to mock the repo, full suite green,
commit. Per-entity specifics:

- [ ] **Task 6 — Transaction.** Repo: `mongo/transaction.repository.ts`. Port the
  three `transactionQuery.service` methods verbatim (the `getRelationshipStats`
  aggregation keeps `new Types.ObjectId(ownerId)` **inside the repo**). Add
  `getDirectionalTotals` (the `$group` by `$type` from `getNetWithCounterparty`),
  `sumSameDayDebits` (the daily-cap aggregate from `transfer.service`), and
  `createMany` (the `Transaction.create([...], {session, ordered:true})` path).
  Consumers: `transactionQuery.service.ts`, `utils/transaction-dto.ts` (read
  `record.id`/fields), and every `ai/tools/*` that imports `Transaction`
  (getNetWithCounterparty, getTotalSentToCounterparty, getTotalReceivedFromCounterparty,
  getRecentTransactions, getTransactionStats, getTransactionsWithCounterparty,
  searchTransactions, getTransactionReceipt, getCounterpartyActivityTimeline,
  getCounterpartySummary, getRecentSentCounterparties, getRecentReceivedCounterparties,
  getLastSentCounterparty, resolveCounterpartyCandidates, transactionHelpers,
  amountResolution, responseBlocks). For each tool: replace the inline
  `Transaction.find(...)`/`.aggregate(...)` with the matching repo method
  (add a repo method when a tool needs a query not yet covered, keeping the
  signature minimal). Rewrite `transactionQuery.service.test.ts` to mock the repo
  (the `instanceof Types.ObjectId` assertion moves into `transaction.repository.test.ts`).

- [ ] **Task 7 — PersonalDetails.** Repo: `mongo/personalDetails.repository.ts`
  (`findByUserId`, `ensureForUser`, `update`; `address` stays a plain object).
  Consumers: `personalDetails.service.ts`, `utils/personal-details.ts`,
  `utils/user-profile-dto.ts`. Rewrite `personalDetails.service.test.ts`.

- [ ] **Task 8 — ExchangeRate.** Repo: `mongo/exchangeRate.repository.ts`
  (`latestForBase`, `findForDate`, `upsertForDate`; `rates` is a plain object).
  Consumer: `fx.service.ts`. Rewrite `fx.service.test.ts`.

- [ ] **Task 9 — AiConversation.** Repo: `mongo/aiConversation.repository.ts`
  (`findByConversationId`, `upsert`; `messages`/`memory` pass through unchanged).
  Consumer: `aiConversation.service.ts`. (No dedicated service test today —
  add a repo contract test only.)

- [ ] **Task 10 — AiPendingTransfer.** Repo: `mongo/aiPendingTransfer.repository.ts`
  (`findById`, `findActiveForConversation`, `create`, `updateStatus`,
  `setIdempotencyResult`; `idempotencyResults` map ↔ plain object). Consumers:
  `aiPendingTransfer.service.ts` (the non-transaction reads/writes here; its
  `withTransaction` blocks are migrated in Task 15), plus `ai/tools/*` pending
  helpers (getPendingAiTransfers, resolvePendingTransferReference,
  pendingTransferHelpers). Rewrite `aiPendingTransfer.service.test.ts`.

- [ ] **Task 11 — AiAuditLog.** Repo: `mongo/aiAuditLog.repository.ts` (`create`).
  Consumer: `aiAuditLog.service.ts`.

- [ ] **Task 12 — VideoSession.** Repo: `mongo/videoSession.repository.ts`
  (`findById`, `findByRoomName`, `create`, `update`, `listForUser`,
  `listActiveForType`; `metadata` plain object). Consumers:
  `videoSession.service.ts`, `routes/videoSession.routes.ts`,
  `ai/videoSessionCta.ts`. The `Types.ObjectId` casts for audit-log writes move
  into the VideoAuditLog repo (Task 13). Rewrite `videoSession.service.test.ts`.

- [ ] **Task 13 — VideoAuditLog.** Repo: `mongo/videoAuditLog.repository.ts`
  (`create`; accepts string ids, casts internally if needed). Consumer:
  `videoAuditLog.service.ts`.

After each task: `npm test` green, then commit
`refactor(db): route <Entity> access through repository seam`.

---

## Stage C — Transaction abstraction cutover

### Task 14: Move `transfer.service` onto `runInTransaction`

**Files:**
- Modify: `src/services/transfer.service.ts`
- Test: `src/fxTransfer.routes.test.ts` (rewrite to mock repos)

**Interfaces:**
- Consumes: `getRepositories().runInTransaction`, `users.findById/findByEmail/setBalance`,
  `transactions.createMany`, `transactions.sumSameDayDebits`.

- [ ] **Step 1: Write the failing test** — assert that an insufficient-balance
  transfer rejects with `AppError(400)` and performs **no** balance writes, using
  a repo mock whose `runInTransaction` runs the callback with a dummy tx:

```ts
// excerpt — src/fxTransfer.routes.test.ts (transfer path)
import assert from "node:assert/strict";
import test from "node:test";
import { executeTransfer } from "./services/transfer.service.js";
import { setRepositories } from "./repositories/index.js";
import { createMongoRepositories } from "./repositories/mongo/index.js";

test("executeTransfer rejects on insufficient balance without writing", async () => {
  const base = createMongoRepositories();
  let setBalanceCalls = 0;
  setRepositories({
    ...base,
    runInTransaction: async (fn) => fn({}),
    users: {
      ...base.users,
      findById: async () => ({ id: "s", email: "s@x.com", balance: 5, role: "user" } as never),
      findByEmail: async () => ({ id: "r", email: "r@x.com", balance: 0, role: "user" } as never),
      setBalance: async () => { setBalanceCalls++; }
    },
    transactions: { ...base.transactions, createMany: async () => { throw new Error("should not insert"); } }
  });
  await assert.rejects(() => executeTransfer({ senderId: "s", recipientEmail: "r@x.com", amount: 100 }));
  assert.equal(setBalanceCalls, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="executeTransfer rejects"`
Expected: FAIL — current code uses `mongoose.startSession()` and `User.findById`.

- [ ] **Step 3: Rewrite `executeTransfer` / `executeTransferWithSession`** to:
  - drop `mongoose.startSession()` and `ClientSession`;
  - `return getRepositories().runInTransaction(async (tx) => { ... })`;
  - read `users.findById(senderId, tx)` / `users.findByEmail(recipient, tx)`;
  - compute the same `Number((..).toFixed(2))` balances;
  - `users.setBalance(senderId, newSender, tx)` / `setBalance(recipientId, newRecipient, tx)`;
  - `transactions.createMany([debitEntry, creditEntry], tx)` (same field shape; preserve `ordered`);
  - keep `assertAiTransferWithinLimits` but feed it `transactions.sumSameDayDebits(..., tx)`;
  - build the DTO from the returned debit `TransactionRecord`.
  The thrown `AppError`s and messages stay identical.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/transfer.service.ts src/fxTransfer.routes.test.ts
git commit -m "refactor(db): move transfer settlement onto runInTransaction"
```

---

### Task 15: Move `aiPendingTransfer.service` transactions onto `runInTransaction`

**Files:**
- Modify: `src/services/aiPendingTransfer.service.ts`
- Test: `src/aiPendingTransfer.service.test.ts`

- [ ] **Step 1:** Write/adjust a failing test asserting the confirm path runs
  inside `runInTransaction` and updates the pending-transfer status + executes the
  transfer atomically (mock repos; assert order/atomicity like Task 14).
- [ ] **Step 2:** Run it — FAIL (still uses `mongoose.startSession()` at the 3 sites).
- [ ] **Step 3:** Replace each of the 3 `session.withTransaction` blocks with
  `getRepositories().runInTransaction(async (tx) => { ... })`, passing `tx` into
  every repo call (`aiPendingTransfers.updateStatus`, `users.setBalance`,
  `transactions.createMany`, etc.). Preserve idempotency-result writes via
  `aiPendingTransfers.setIdempotencyResult(id, key, value, tx)`.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `refactor(db): move AI pending-transfer settlement onto runInTransaction`.

---

## Stage D — Lockdown

### Task 16: Enforce the seam + final verification

**Files:**
- Create: `src/repositories/no-direct-model-imports.test.ts`

**Interfaces:**
- Consumes: filesystem scan of `src/`.

- [ ] **Step 1: Write the failing test**

```ts
// src/repositories/no-direct-model-imports.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED_PREFIX = path.join(ROOT, "repositories", "mongo");

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("only mongo repositories import ../models/*", async () => {
  const offenders: string[] = [];
  for (const file of await walk(ROOT)) {
    if (file.startsWith(ALLOWED_PREFIX)) continue;
    const src = await readFile(file, "utf8");
    if (/from\s+["'](\.\.\/)*models\//.test(src)) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, [], `Files still importing models directly: ${offenders.join(", ")}`);
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- --test-name-pattern="import ../models"`
Expected: FAIL if any consumer was missed — the failure message lists exactly
which files. Fix each by routing it through the repo, then re-run.

- [ ] **Step 3: Full verification**

Run: `npm test` (whole suite) and `npm run build` (tsc). Both must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/repositories/no-direct-model-imports.test.ts
git commit -m "test(db): enforce repository seam; complete Plan 1"
```

---

## Done criteria for Plan 1

- `npm test` and `npm run build` are green.
- App still runs on Mongo with identical behaviour (`VIRLY_DB_DRIVER` defaults to `mongo`).
- No file outside `src/repositories/mongo/` imports a model.
- `createRepositories("postgres")` throws — Plan 2 implements it.

**Next:** Plan 2 (`docs/superpowers/plans/2026-06-22-postgres-migration-driver.md`)
adds the Drizzle schema, Postgres repositories satisfying these same interfaces,
the contract suite run against both real DBs, TTL sweeper, sync/verify scripts,
and the cutover wiring.
