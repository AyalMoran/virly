# Reversible MongoDB → PostgreSQL Migration (Phase 1) — Design Spec

**Status:** ✅ Shipped — Phase 1 implemented and merged to `main` (PRs #1 and #2;
"complete Phase 1" landed in commit `141be05`). The repository seam,
both driver implementations, the boot-time `VIRLY_DB_DRIVER` flag, the TTL
sweeper, and the sync/parity scripts all exist under `server/`. This document is
retained as the design of record; the two implementation plans are in
[`../plans/`](../plans/). Phase 2 (LangGraph persistence on Postgres) remains out
of scope per §13.
**Date:** 2026-06-22
**Author:** brainstormed with the team
**Scope:** `server/` only (the Express/Mongoose API). The client and AI prompt
logic are unaffected.

---

## Goal (hand this to the implementing agent)

> Make the Virly server able to run on **either MongoDB or PostgreSQL**, chosen
> by a single boot-time flag (`VIRLY_DB_DRIVER`), with **identical observable API
> behaviour** on both, and a **trivial transition back to MongoDB** (flip the
> flag + run a reverse data-sync). Achieve this by introducing a repository
> abstraction between the service/tool layer and the database, with two
> implementations (Mongoose and Drizzle/Postgres) behind one interface. **Phase 1
> covers the 9 application collections only**; the LangGraph AI memory
> (checkpointer + long-term store) stays on MongoDB and is migrated later in a
> separate Phase 2.

**Definition of done for Phase 1:**
1. With `VIRLY_DB_DRIVER=mongo` (the default) the app behaves exactly as it does today; the full existing test suite passes.
2. With `VIRLY_DB_DRIVER=postgres` the app passes the same suite plus a shared repository contract suite run against a real Postgres.
3. A one-time `sync-mongo-to-postgres` script populates Postgres from an existing Mongo dataset, and `verify-parity` reports zero mismatches.
4. A `sync-postgres-to-mongo` script exists and is verified, proving reversibility.
5. No file outside the two repository implementations imports a Mongoose model or a Drizzle table directly.

---

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Reversibility model | **Boot-time flag, exactly one DB live** | Simplest correct model; no dual-write consistency burden. Revert = flip flag + reverse sync. |
| Phase 1 scope | **The 9 app collections**; LangGraph stays on Mongo | Isolates the highest-risk piece (LangGraph persistence) into a later, separate plan. Each phase is independently shippable. |
| Primary keys | **24-hex ObjectId strings in both drivers** | Preserves DTOs, the `^[0-9a-fA-F]{24}$` routing regex, foreign keys, and client assumptions byte-for-byte; makes reverse sync trivial. |
| Postgres library | **Drizzle ORM** (+ `drizzle-kit`, `drizzle-zod`) | Lightweight, TS-native, first-class JSONB, ESM-friendly, reuses existing Zod schemas, low runtime magic, clean to wrap behind a repository interface. |
| Seam shape | **Repository interfaces returning plain domain records** | Only shape that cleanly satisfies both "don't break behaviour" and "transition back". Cost is a broad but mechanical consumer + test refactor. |

---

## 1. Architecture — the data-access seam

A single boundary sits between the service/tool layer and the database driver:

```
routes / AI tools / services
        │  (depend only on Repositories interfaces + domain record types)
        ▼
   Repositories  ────────────────┬──────────────────────────────┐
        ▲                        │                               │
        │                  MongoRepositories             PostgresRepositories
   repositoryRegistry        (Mongoose models)             (Drizzle tables)
   built once at boot
   from config.dbDriver
```

- `config.dbDriver: "mongo" | "postgres"` parsed from `VIRLY_DB_DRIVER`
  (default `"mongo"`, so the current behaviour is the default and untouched).
- `createRepositories(driver): Repositories` is called once during boot and the
  result is the single source consumers use. No consumer imports a Mongoose
  model or a Drizzle table — only the two implementation packages do.
- Reverting to Mongo = set `VIRLY_DB_DRIVER=mongo` + run the reverse sync script.
  Nothing in application code changes.

---

## 2. Repository interfaces + domain records

Each entity gets one interface and one plain record type. Records are POJOs with
`id: string` (24-hex). **Repositories never return Mongoose Documents or Drizzle
row objects** — they return records, so consumers can't depend on driver-specific
APIs (`.save()`, `.toObject()`, query builders).

Example (User):

```ts
export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  phone: string;
  isVerified: boolean;
  personalDetails: string | null;        // FK (24-hex) or null
  verificationTokenHash: string | null;
  verificationTokenExpiresAt: Date | null;
  balance: number;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

// secrets omitted at the repo boundary (replaces the "-passwordHash …" projection)
export type PublicUserRecord = Omit<UserRecord, "passwordHash" | "verificationTokenHash">;

export interface UserRepository {
  findById(id: string, tx?: TxContext): Promise<UserRecord | null>;
  findByIdSafe(id: string, tx?: TxContext): Promise<PublicUserRecord | null>;
  findByEmail(email: string, tx?: TxContext): Promise<UserRecord | null>;
  create(input: CreateUserInput, tx?: TxContext): Promise<UserRecord>;
  updateBalance(id: string, newBalance: number, tx?: TxContext): Promise<void>;
  // …only the operations services actually use today
}
```

The registry aggregates all repositories and the transaction abstraction:

```ts
export interface Repositories {
  users: UserRepository;
  transactions: TransactionRepository;
  personalDetails: PersonalDetailsRepository;
  aiConversations: AiConversationRepository;
  aiPendingTransfers: AiPendingTransferRepository;
  exchangeRates: ExchangeRateRepository;
  aiAuditLogs: AiAuditLogRepository;
  videoSessions: VideoSessionRepository;
  videoAuditLogs: VideoAuditLogRepository;
  runInTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}
```

The exact method set per repository is derived during planning from current
call sites — every method must map 1:1 to an operation a service or AI tool
performs today. No speculative methods (YAGNI).

---

## 3. Transaction / unit-of-work abstraction (load-bearing)

`transfer.service` and `aiPendingTransfer.service` perform money movement inside
multi-document transactions (`mongoose.startSession()` →
`session.withTransaction()`; this is why docker-compose runs Mongo as replica set
`rs0`). The same atomicity must hold on Postgres.

- `TxContext` is an **opaque handle**: a `ClientSession` under Mongo, a Drizzle
  transaction under Postgres. Consumers never inspect it; they only pass it back
  into repo methods.
- **Mongo impl:** `runInTransaction(fn)` opens a session and calls
  `session.withTransaction(() => fn(session))`; repo methods forward
  `{ session }` to the underlying Mongoose calls.
- **Postgres impl:** `runInTransaction(fn)` calls `db.transaction(tx => fn(tx))`;
  repo methods run their statements against `tx`.
- Services are rewritten to:
  ```ts
  await repos.runInTransaction(async (tx) => {
    const sender = await repos.users.findById(senderId, tx);
    // …assert limits…
    await repos.users.updateBalance(senderId, newBalance, tx);
    await repos.transactions.create(debitEntry, tx);
    // …credit + ledger entry…
  });
  ```
- The daily-cap read inside the transaction becomes a repo method
  `transactions.sumSameDayDebits(senderId, since, tx)` (Mongo: aggregate within
  session; Postgres: `SELECT SUM(amount)` within tx).

**Concurrency note (parity, not improvement):** Postgres `READ COMMITTED` carries
the same write-skew caveat already documented in `transfer.service` for Mongo
snapshot isolation. Phase 1 preserves current behaviour; it is not a hardening
pass. (Tightening to `SERIALIZABLE` / `SELECT … FOR UPDATE` is explicitly out of
scope.)

---

## 4. PostgreSQL schema mapping (Drizzle)

General rules:

- **Primary keys:** `id char(24)` (ObjectId hex). Foreign keys are `char(24)`.
  New ids are generated in the Postgres repo with
  `new mongoose.Types.ObjectId().toString()` (no DB connection required;
  `mongoose` is already a dependency). Mongo repo lets Mongoose generate ids as
  today. Both produce the same 24-hex format.
- **Money / numeric fields** (`balance`, `amount`, `enteredAmount`,
  `exchangeRateUsed`): `double precision`, to mirror current JS `Number`
  semantics exactly and avoid silent rounding drift in aggregated totals.
  *Future hardening to `numeric` is out of scope.*
- **Enums** (`role`, transaction `type`, pending-transfer/video statuses, video
  enums): stored as `text` with a `CHECK` constraint listing the same allowed
  values. (Avoids `ALTER TYPE` churn as value sets evolve; Drizzle migrations
  stay simple.)
- **Embedded objects / `Mixed` / `Map` → `jsonb`:** preserves shape exactly.
- **String arrays** (`AiAuditLog.toolsRequested`, `toolsExecuted`) → `text[]`.
- **Timestamps:** `timestamptz`; `createdAt`/`updatedAt` maintained in the repo
  layer to mirror Mongoose `timestamps`.

Per-collection mapping (column names mirror the Mongoose field names):

| Collection | Notable columns / types | Indexes & uniques to mirror |
|---|---|---|
| **users** | `email text` (lowercased on write), `passwordHash`, `phone`, `isVerified bool`, `personalDetails char(24) null`, `verificationTokenHash null`, `verificationTokenExpiresAt timestamptz null`, `balance double`, `role text CHECK` | unique(`email`); index(`role`) |
| **transactions** | `ownerId char(24)`, `counterpartyEmail`, `amount double`, `type text CHECK(credit\|debit)`, `directionLabel`, `reason text null`, FX: `enteredCurrency text null CHECK(ILS\|USD\|EUR)`, `enteredAmount double null`, `exchangeRateUsed double null`, `exchangeRateFetchedAt timestamptz null` | index(`ownerId`) |
| **personalDetails** | `userId char(24)`, `status text CHECK(not_provided\|provided)`, `firstName null`, `lastName null`, `dateOfBirth timestamptz null`, `address jsonb`, `lastSkippedAt timestamptz null` | unique(`userId`) |
| **aiConversations** | `userId char(24)`, `conversationId text`, `assistantId text`, `messages jsonb`, `memory jsonb`, `expiresAt timestamptz` | unique(`userId`,`conversationId`); index(`userId`); index(`conversationId`); **TTL via sweeper** (§5) |
| **aiPendingTransfers** | `userId`, `conversationId`, `assistantId`, `recipientEmail`, `version int`, `currency text CHECK(ILS)`, `recipientFirstName/LastName null`, `amount double`, `reason null`, `status text CHECK`, `supersededById char(24) null`, `supersedesId char(24) null`, `idempotencyResults jsonb`, `expiresAt timestamptz` | index(`userId`); index(`conversationId`); index(`status`); **TTL via sweeper** (§5) |
| **exchange_rates** | `baseCurrency`, `rates jsonb`, `provider`, `fetchedAt timestamptz`, `validForDate text`, `expiresAt timestamptz`, `sourceResponseHash null` | unique(`baseCurrency`,`validForDate`); index(`baseCurrency`,`fetchedAt desc`). **No TTL** (matches Mongo: `expiresAt` here is a plain field) |
| **aiAuditLogs** | `userId`, `conversationId`, `requestId null`, `assistantId`, `intent`, `toolsRequested text[]`, `toolsExecuted text[]`, `refusalReason null`, `diagnostics jsonb` | index(`userId`); index(`conversationId`); index(`requestId`) |
| **videoSessions** | `userId`, `assignedAgentId char(24) null`, `type text CHECK`, `status text CHECK`, `roomName`, `provider text CHECK`, `topic null`, `userProblemSummary null`, `startedAt/endedAt/userJoinedAt/agentJoinedAt timestamptz null`, `metadata jsonb` | unique(`roomName`); index(`userId`); index(`assignedAgentId`); index(`type`); index(`status`) |
| **videoAuditLogs** | `event text CHECK`, `actorId`, `actorRole text CHECK`, `targetUserId`, `videoSessionId`, `sessionType text CHECK`, `result text CHECK(success\|failure)`, `ipAddress null`, `userAgent null`, `details jsonb` | index(`event`); index(`actorId`); index(`targetUserId`); index(`videoSessionId`) |

---

## 5. TTL handling (Postgres mode only)

Mongo auto-expires `aiConversations.expiresAt` and
`aiPendingTransfers.expiresAt` via TTL indexes. Postgres has no TTL, so in
**Postgres mode only** an in-process sweeper — same pattern as the existing
`startDailyFxRefresh` `setInterval` in boot — periodically runs
`DELETE FROM <table> WHERE expiresAt < now()` for those two tables. In Mongo mode
the native TTL keeps working and no sweeper runs. `exchange_rates.expiresAt` is
*not* a TTL index today and gets no sweeper.

---

## 6. LangGraph hybrid (Phase 1)

The v2 agent's `MongoDBSaver` (thread checkpointer) and `MongoDBStore`
(long-term memory) remain on Mongo in Phase 1. Therefore **in Postgres mode the
app still opens the Mongoose connection**, used *only* by the checkpointer/store
(`mongoose.connection.getClient()`), never by repositories.

Boot (`connectDb` / `index.ts`) becomes:
- Always connect Mongoose (LangGraph depends on it).
- Additionally initialise the Postgres pool when `dbDriver === "postgres"`.

This hybrid is explicit and documented. Phase 2 (separate spec) swaps the
checkpointer/store to `@langchain/langgraph-checkpoint-postgres` and lets Mongo be
turned off entirely.

---

## 7. Consumer refactor & error parity

- **Surface:** ~40 files (services, `utils/` DTO mappers, ~25 AI tools) switch
  from importing models to using `repos.*`. DTO mappers (`transaction-dto.ts`,
  `user-profile-dto.ts`, `personal-details.ts`) read `record.id` and plain fields
  instead of `doc._id` / `.toObject()`. The `new Types.ObjectId(ownerId)` casts in
  AI tools and `transactionQuery.service` move behind repo methods and disappear
  from consumers.
- **Duplicate-key parity:** both repo impls normalise driver duplicate-key errors
  to a shared `DuplicateKeyError` (Mongo `E11000` ↔ Postgres `23505`) so callers
  (e.g. signup on a duplicate email) behave identically.
- **Malformed-id parity:** repo `findById` treats an invalid/malformed id as
  "not found" (returns `null`) rather than throwing, matching today's
  regex-guarded call sites and avoiding a Mongoose `CastError` vs Postgres
  divergence.

---

## 8. Data-sync tooling

Standalone scripts under `server/scripts/`:

- `sync-mongo-to-postgres.ts` — reads each collection, transforms via the same
  mappers the repos use, bulk-upserts into Postgres keyed on `id` (idempotent;
  safe to re-run).
- `sync-postgres-to-mongo.ts` — the reverse direction, for transition-back.
- `verify-parity.ts` — per-collection row counts plus a checksum over
  canonicalised records; exits non-zero on any mismatch. Doubles as the migration
  acceptance gate.

Cutover is brief and explicit (the driver is chosen at boot), so a short
maintenance window during the sync is acceptable. **No dual-write machinery.**

---

## 9. Testing strategy

- **Service / AI-tool tests** (today's white-box Mongoose mocks that patch
  `Model.find().sort().limit()`, `.aggregate([{ $match }])`, `.select()`) are
  rewritten to **mock the repository interfaces**. They keep asserting the same
  business behaviour, now driver-agnostic. Mongoose-specific assertions
  (`instanceof Types.ObjectId`, skip/limit chaining) leave the service tests.
- **One shared repository contract suite** asserts the same behaviour against
  **both** a real Mongo and a real Postgres. A `postgres` service is added to
  `docker-compose` (test profile) so the suite has a real Postgres to run
  against. This suite is the actual proof of "don't break behaviour".
- `verify-parity.ts` serves as the end-to-end migration acceptance test.

The repo has no `mongodb-memory-server` and no live-DB tests today; the contract
suite is the first live-DB test tier and depends on docker.

---

## 10. Configuration & environment

| Var | Default | Meaning |
|---|---|---|
| `VIRLY_DB_DRIVER` | `mongo` | `mongo` or `postgres`; selects the live database at boot. |
| `VIRLY_POSTGRES_URL` | — | Postgres connection string (required when driver is `postgres`). |
| `VIRLY_MONGODB_URI` | existing | Still required in both modes (LangGraph in Postgres mode). |

Both new vars documented in `.env.example` and `README.md`. `config.ts` validates
that `VIRLY_POSTGRES_URL` is present when `dbDriver === "postgres"` and fails fast
on boot otherwise (mirrors the existing JWT-secret fail-fast pattern).

---

## 11. File structure

```
server/
  drizzle.config.ts                      # drizzle-kit config
  drizzle/                               # generated SQL migrations
  src/
    config.ts                            # + dbDriver, postgresUrl (modified)
    db.ts                                # connectDb: always Mongo; + PG pool when postgres (modified)
    db/
      postgres.ts                        # Drizzle client/pool init
    repositories/
      types.ts                           # domain record types + repo interfaces + TxContext + DuplicateKeyError
      registry.ts                        # createRepositories(driver) factory
      mongo/                             # Mongoose-backed implementations (wrap current model calls)
        *.repository.ts
      postgres/
        schema.ts                        # Drizzle table definitions
        *.repository.ts                  # Drizzle-backed implementations
    ttl/sweeper.ts                       # interval sweeper (postgres mode)
  scripts/
    sync-mongo-to-postgres.ts
    sync-postgres-to-mongo.ts
    verify-parity.ts
  tests/
    repositories/contract/*.contract.test.ts   # run vs both real DBs
```

(Exact placement follows existing conventions during planning; `models/` stays as
the Mongo repos' backing definitions.)

---

## 12. Cutover & rollback runbook

**Forward (Mongo → Postgres):**
1. Provision Postgres; set `VIRLY_POSTGRES_URL`.
2. Run `drizzle-kit` migrations to create the schema.
3. (Maintenance window) run `sync-mongo-to-postgres.ts`.
4. Run `verify-parity.ts` — must report zero mismatches.
5. Set `VIRLY_DB_DRIVER=postgres`; restart. LangGraph is unaffected (still Mongo).

**Rollback (Postgres → Mongo):**
1. (Maintenance window) run `sync-postgres-to-mongo.ts`.
2. Run `verify-parity.ts`.
3. Set `VIRLY_DB_DRIVER=mongo`; restart.

---

## 13. Out of scope (Phase 2 — separate spec)

- LangGraph checkpointer/store → `@langchain/langgraph-checkpoint-postgres`.
- Turning the Mongo connection off entirely.
- `numeric` money-type hardening and `SERIALIZABLE`/row-lock concurrency
  tightening.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Transaction abstraction loses atomicity on Postgres | Contract suite asserts atomic rollback on both drivers; money-movement services covered explicitly. |
| JSONB fidelity drift (Mixed/Map/subdocs) | Shared mappers used by both repos and sync scripts; `verify-parity` checksums canonicalised records. |
| Broad consumer refactor introduces regressions | Driver default stays `mongo`; full existing suite must stay green throughout; refactor is mechanical and incremental per entity. |
| TTL behaviour differs | Sweeper covers the two TTL collections; contract test asserts expired rows are removed. |
| Duplicate-key / cast-error divergence | Normalised `DuplicateKeyError`; `findById` returns null on malformed ids. |
