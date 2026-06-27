# Verification Tokens Collection Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move email-verification tokens off the `User` document/row into a dedicated
`verification_tokens` collection (Mongo) / table (Postgres), behind a new repository in
the existing seam — so user records stop carrying transient auth secrets and tokens can
expire/clean up independently.

**Architecture:** A new `VerificationTokenRepository` (one record per user: `userId`,
`tokenHash`, `expiresAt`) joins the `Repositories` interface with Mongo and Postgres
implementations. `auth.service` issues/verifies/clears tokens through it instead of the
inline `User` fields. The split lands in a safe order: (1) add the new store and switch
the service to it while the old fields still exist; (2) backfill existing tokens; (3)
remove the inline fields. Each phase is independently shippable and keeps email
verification working.

**Tech Stack:** Node ESM + TypeScript, Mongoose 8, Drizzle/`pg`, the repository seam
(`server/src/repositories/`), `node:test` + `tsx`.

**Related:** repository seam design — `docs/superpowers/specs/2026-06-22-postgres-migration-design.md`;
[ADR 0004 repository interface seam](../../adr/0004-repository-interface-seam.md).

## Global Constraints

- ESM: relative imports end in `.js`. Server unit tests: `cd server && npm test`. Paths
  relative to `server/` unless noted.
- Both drivers must stay byte-for-byte behavior-compatible: `VIRLY_DB_DRIVER=mongo`
  (default) and `=postgres` both pass the same tests.
- No file outside `src/repositories/mongo/` imports `../models/`; no file outside
  `src/repositories/postgres/` imports drizzle schema directly (the
  `no-direct-model-imports.test.ts` guard stays green).
- Token hashes are secrets: `PublicUserRecord` and all "safe" projections must never
  include them (they already omit `verificationTokenHash`).
- IDs stay 24-hex ObjectId strings in records.
- TDD: failing test → watch fail → implement → watch pass → commit.

## Approach & rationale

Two shapes were considered:

1. **One active token per user, keyed by `userId` (chosen).** Matches the current flow
   exactly — the token is issued for a user, looked up by the user id decoded from the
   JWT, and compared by hash. An `upsert`-by-userId store is the minimal faithful model
   and supports a natural TTL/unique constraint on `userId`.
2. **Token history (many rows per user).** More general (audit trail of issued links)
   but YAGNI for the current single-active-token semantics. Rejected; the chosen shape
   can grow into it later if needed.

Safe sequencing (add → switch → backfill → remove) avoids a flag day: verification keeps
working at every commit, and the destructive column/field drop happens only after the
service no longer reads the old fields and data is backfilled.

## File Structure

| File | Responsibility |
|---|---|
| `src/repositories/types.ts` (modify) | `VerificationTokenRecord`, `VerificationTokenRepository`; add to `Repositories`. |
| `src/models/VerificationToken.ts` (create) | Mongoose model + TTL index on `expiresAt`. |
| `src/repositories/mongo/verificationToken.repository.ts` (create) | Mongo impl + record mapper. |
| `src/repositories/mongo/index.ts` (modify) | Register the Mongo impl. |
| `src/repositories/postgres/schema.ts` (modify) | `verification_tokens` drizzle table. |
| `src/repositories/postgres/verificationToken.repository.ts` (create) | Postgres impl. |
| `src/repositories/postgres/index.ts` (modify) | Register the Postgres impl. |
| `src/services/auth.service.ts` (modify) | Issue/verify/clear via the new repo. |
| `src/models/User.ts`, `src/repositories/.../user.repository.ts`, `postgres/schema.ts` (modify) | Remove inline token fields (final phase). |
| `scripts/migrate-verification-tokens.mongodb.js` (create) | Mongo backfill. |
| `server/drizzle/*` (generated) | Postgres migration (add table; later drop columns). |
| `src/ttl/sweeper.ts` (modify) | Sweep expired verification tokens (Postgres). |

---

## Task 1: Record type + repository interface

**Files:**
- Modify: `src/repositories/types.ts`
- Test: `src/repositories/verificationToken.types.test.ts`

**Interfaces:**
- Produces:
  - `type VerificationTokenRecord = { id: string; userId: string; tokenHash: string; expiresAt: Date; createdAt: Date; updatedAt: Date }`
  - `interface VerificationTokenRepository { upsertForUser(userId: string, tokenHash: string, expiresAt: Date, tx?: TxContext): Promise<VerificationTokenRecord>; findByUserId(userId: string, tx?: TxContext): Promise<VerificationTokenRecord | null>; deleteForUser(userId: string, tx?: TxContext): Promise<void>; deleteExpired(now: Date, tx?: TxContext): Promise<number> }`
  - `Repositories.verificationTokens: VerificationTokenRepository`

- [ ] **Step 1: Write the failing test**

```ts
// src/repositories/verificationToken.types.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import type { VerificationTokenRecord, VerificationTokenRepository } from "./types.js";

test("VerificationTokenRecord and repository shape compile", () => {
  // Compile-time contract: a conforming stub satisfies the interface.
  const rec: VerificationTokenRecord = {
    id: "1", userId: "u1", tokenHash: "h", expiresAt: new Date(),
    createdAt: new Date(), updatedAt: new Date()
  };
  const repo: VerificationTokenRepository = {
    async upsertForUser() { return rec; },
    async findByUserId() { return null; },
    async deleteForUser() {},
    async deleteExpired() { return 0; }
  };
  assert.equal(typeof repo.upsertForUser, "function");
  assert.equal(rec.userId, "u1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/repositories/verificationToken.types.test.ts`
Expected: FAIL — types not exported.

- [ ] **Step 3: Add the type + interface**

In `src/repositories/types.ts` add the record (near the other records) and interface
(near the other interfaces), and a field on `Repositories`:

```ts
export type VerificationTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export interface VerificationTokenRepository {
  /** Replace the user's active token (one per user). */
  upsertForUser(userId: string, tokenHash: string, expiresAt: Date, tx?: TxContext): Promise<VerificationTokenRecord>;
  findByUserId(userId: string, tx?: TxContext): Promise<VerificationTokenRecord | null>;
  deleteForUser(userId: string, tx?: TxContext): Promise<void>;
  /** Delete all tokens with expiresAt < now; returns the count removed. */
  deleteExpired(now: Date, tx?: TxContext): Promise<number>;
}
```

In `interface Repositories { … }` add:

```ts
  verificationTokens: VerificationTokenRepository;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/repositories/verificationToken.types.test.ts`
Expected: PASS.

> The `Repositories` change makes the existing registry impls incomplete — that's
> resolved in Tasks 2 & 3. Build will fail until both are added; proceed to Task 2.

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/types.ts server/src/repositories/verificationToken.types.test.ts
git commit -m "feat(repos): VerificationTokenRepository interface + record type"
```

---

## Task 2: Mongo model + repository

**Files:**
- Create: `src/models/VerificationToken.ts`
- Create: `src/repositories/mongo/verificationToken.repository.ts`
- Modify: `src/repositories/mongo/index.ts`
- Test: `src/repositories/mongo/verificationToken.repository.test.ts` (mapper-level, no live DB)

**Interfaces:**
- Consumes: `VerificationTokenRecord`/`VerificationTokenRepository` (Task 1).
- Produces: `createMongoVerificationTokenRepository(): VerificationTokenRepository`; registered in `createMongoRepositories()`.

- [ ] **Step 1: Write the failing test (record mapper)**

```ts
// src/repositories/mongo/verificationToken.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { toVerificationTokenRecord } from "./verificationToken.repository.js";

test("maps a Mongo doc to a plain VerificationTokenRecord", () => {
  const now = new Date();
  const rec = toVerificationTokenRecord({
    _id: { toString: () => "abc" },
    userId: { toString: () => "u1" },
    tokenHash: "h",
    expiresAt: now,
    createdAt: now,
    updatedAt: now
  });
  assert.equal(rec.id, "abc");
  assert.equal(rec.userId, "u1");
  assert.equal(rec.tokenHash, "h");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/repositories/mongo/verificationToken.repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement model + repository + register**

```ts
// src/models/VerificationToken.ts
import { Schema, model } from "mongoose";

const verificationTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// TTL: Mongo drops the doc shortly after it expires (cleanup for free).
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken = model("VerificationToken", verificationTokenSchema);
```

```ts
// src/repositories/mongo/verificationToken.repository.ts
import { VerificationToken } from "../../models/VerificationToken.js";
import type {
  TxContext,
  VerificationTokenRecord,
  VerificationTokenRepository
} from "../types.js";
import { asSession } from "./transaction.js"; // match the helper the other mongo repos use

export function toVerificationTokenRecord(d: Record<string, unknown>): VerificationTokenRecord {
  return {
    id: (d._id as { toString(): string }).toString(),
    userId: (d.userId as { toString(): string }).toString(),
    tokenHash: d.tokenHash as string,
    expiresAt: d.expiresAt as Date,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export function createMongoVerificationTokenRepository(): VerificationTokenRepository {
  return {
    async upsertForUser(userId, tokenHash, expiresAt, tx?: TxContext) {
      const doc = await VerificationToken.findOneAndUpdate(
        { userId },
        { $set: { tokenHash, expiresAt } },
        { upsert: true, new: true, session: asSession(tx) }
      ).lean();
      return toVerificationTokenRecord(doc as Record<string, unknown>);
    },
    async findByUserId(userId, tx?: TxContext) {
      const doc = await VerificationToken.findOne({ userId }, null, {
        session: asSession(tx)
      }).lean();
      return doc ? toVerificationTokenRecord(doc as Record<string, unknown>) : null;
    },
    async deleteForUser(userId, tx?: TxContext) {
      await VerificationToken.deleteOne({ userId }, { session: asSession(tx) });
    },
    async deleteExpired(now, tx?: TxContext) {
      const res = await VerificationToken.deleteMany(
        { expiresAt: { $lt: now } },
        { session: asSession(tx) }
      );
      return res.deletedCount ?? 0;
    }
  };
}
```

> Confirm the exact `asSession`/session-passing convention against an existing mongo repo
> (e.g. `mongo/aiPendingTransfer.repository.ts`) and match it.

In `src/repositories/mongo/index.ts`, import and register:

```ts
import { createMongoVerificationTokenRepository } from "./verificationToken.repository.js";
// within createMongoRepositories():
  verificationTokens: createMongoVerificationTokenRepository(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/repositories/mongo/verificationToken.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/models/VerificationToken.ts server/src/repositories/mongo/verificationToken.repository.ts server/src/repositories/mongo/index.ts server/src/repositories/mongo/verificationToken.repository.test.ts
git commit -m "feat(repos): Mongo verification-token store with TTL index"
```

---

## Task 3: Postgres table + repository

**Files:**
- Modify: `src/repositories/postgres/schema.ts`
- Create: `src/repositories/postgres/verificationToken.repository.ts`
- Modify: `src/repositories/postgres/index.ts`
- Generate: a drizzle migration (adds the table)

**Interfaces:**
- Consumes: `VerificationTokenRepository` (Task 1).
- Produces: `createPostgresVerificationTokenRepository(): VerificationTokenRepository`; registered.

- [ ] **Step 1: Add the table to the drizzle schema**

In `src/repositories/postgres/schema.ts`, mirror the conventions used by existing tables
(string PK, timestamps `withTimezone`):

```ts
export const verificationTokens = pgTable("verification_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
```

- [ ] **Step 2: Implement the repository + register**

```ts
// src/repositories/postgres/verificationToken.repository.ts
import { and, eq, lt } from "drizzle-orm";
import { verificationTokens } from "./schema.js";
import { newId } from "./id.js"; // match how other pg repos mint 24-hex ids
import { asPgTx } from "./transaction.js"; // match existing pg repos
import type {
  TxContext,
  VerificationTokenRecord,
  VerificationTokenRepository
} from "../types.js";

function toRecord(r: typeof verificationTokens.$inferSelect): VerificationTokenRecord {
  return {
    id: r.id,
    userId: r.userId,
    tokenHash: r.tokenHash,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export function createPostgresVerificationTokenRepository(): VerificationTokenRepository {
  return {
    async upsertForUser(userId, tokenHash, expiresAt, tx?: TxContext) {
      const now = new Date();
      const [row] = await asPgTx(tx)
        .insert(verificationTokens)
        .values({ id: newId(), userId, tokenHash, expiresAt, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: verificationTokens.userId,
          set: { tokenHash, expiresAt, updatedAt: now }
        })
        .returning();
      return toRecord(row);
    },
    async findByUserId(userId, tx?: TxContext) {
      const [row] = await asPgTx(tx)
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.userId, userId))
        .limit(1);
      return row ? toRecord(row) : null;
    },
    async deleteForUser(userId, tx?: TxContext) {
      await asPgTx(tx).delete(verificationTokens).where(eq(verificationTokens.userId, userId));
    },
    async deleteExpired(now, tx?: TxContext) {
      const rows = await asPgTx(tx)
        .delete(verificationTokens)
        .where(lt(verificationTokens.expiresAt, now))
        .returning({ id: verificationTokens.id });
      return rows.length;
    }
  };
}
```

> Verify `newId`/`asPgTx`/import paths against an existing pg repo (e.g.
> `postgres/aiPendingTransfer.repository.ts`) and match them exactly.

In `src/repositories/postgres/index.ts`, register:

```ts
import { createPostgresVerificationTokenRepository } from "./verificationToken.repository.js";
// within createPostgresRepositories():
  verificationTokens: createPostgresVerificationTokenRepository(),
```

- [ ] **Step 3: Generate the migration**

Run: `cd server && npm run db:generate`
Expected: a new migration adding `verification_tokens` appears under `server/drizzle/`.

- [ ] **Step 4: Build to confirm both registries satisfy `Repositories`**

Run: `cd server && npx tsc -p tsconfig.json --noEmit`
Expected: no errors — both Mongo and Postgres registries now provide `verificationTokens`.

- [ ] **Step 5: Run the registry + types guard suites**

Run: `cd server && npx tsx --test src/repositories/registry.test.ts src/repositories/types.test.ts src/repositories/no-direct-model-imports.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/repositories/postgres/schema.ts server/src/repositories/postgres/verificationToken.repository.ts server/src/repositories/postgres/index.ts server/drizzle
git commit -m "feat(repos): Postgres verification-token table + repository"
```

---

## Task 4: Switch `auth.service` to the new store (old fields still present)

**Files:**
- Modify: `src/services/auth.service.ts`
- Test: `src/auth.service.test.ts` (extend)

**Interfaces:**
- Consumes: `getRepositories().verificationTokens` (Tasks 2–3).
- The issue/verify/clear flow now reads/writes the new store; `users.markVerified` is
  still called (its inline clearing is harmless until Task 6 removes it).

- [ ] **Step 1: Write the failing test**

Add to `src/auth.service.test.ts` a test that, with an injected fake `Repositories`
(matching the suite's existing fake-repo pattern), `verifyEmail`:
- calls `verificationTokens.findByUserId(userId)`,
- accepts a matching `tokenHash`/unexpired token,
- calls `verificationTokens.deleteForUser(userId)` and `users.markVerified(userId)` on success,
- rejects an expired or mismatched token.

```ts
// sketch — align with the file's existing fake-repo + helpers
test("verifyEmail validates against the verification_tokens store and clears it", async () => {
  const fake = makeFakeRepos(); // existing helper in this test file
  const userId = "u1";
  const token = createVerificationToken(userId);
  fake.users._set({ id: userId, isVerified: false /* …minimal UserRecord… */ });
  await fake.verificationTokens.upsertForUser(userId, hashToken(token), verificationTokenExpiry());

  await authService.verifyEmail(token);

  assert.equal((await fake.users.findById(userId))!.isVerified, true);
  assert.equal(await fake.verificationTokens.findByUserId(userId), null);
});
```

> If the auth suite constructs repos via `getRepositories()` rather than injection, follow
> that file's actual setup (it may use an in-memory Mongo or a fake registry) — match it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/auth.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewire the service**

In `src/services/auth.service.ts`:

Issue path (`sendNewVerificationLink`): replace `users.setVerificationToken(...)` with

```ts
await getRepositories().verificationTokens.upsertForUser(
  user.id,
  hashToken(verificationToken),
  verificationTokenExpiry()
);
```

Verify path (`verifyEmail`): replace the inline-field checks

```ts
const tokenRecord = await getRepositories().verificationTokens.findByUserId(userId);
const isExpired = !tokenRecord || tokenRecord.expiresAt.getTime() < Date.now();
const isMatch = Boolean(tokenRecord) && tokenRecord!.tokenHash === hashToken(token);
// …existing guards that reject on expired/mismatch…
await getRepositories().users.markVerified(user.id);
await getRepositories().verificationTokens.deleteForUser(user.id);
```

Remove the dead `verificationTokenHash`/`verificationTokenExpiresAt` reads from the
service (they now live in `tokenRecord`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/auth.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the auth + email suites**

Run: `cd server && npx tsx --test src/auth.service.test.ts src/email.service.test.ts src/authCookie.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/auth.service.ts server/src/auth.service.test.ts
git commit -m "refactor(auth): issue/verify/clear via verification_tokens store"
```

---

## Task 5: Backfill existing tokens

**Files:**
- Create: `scripts/migrate-verification-tokens.mongodb.js` (Mongo backfill)
- The Postgres backfill is a SQL step appended to the generated migration (or a follow-up
  migration): copy non-null inline tokens into `verification_tokens` before columns drop.

- [ ] **Step 1: Mongo backfill script**

```js
// scripts/migrate-verification-tokens.mongodb.js
// Run against the app DB. Copies inline User verification tokens into the new collection.
db.users.find({ verificationTokenHash: { $ne: null } }).forEach((u) => {
  db.verificationtokens.updateOne(
    { userId: u._id },
    {
      $set: {
        userId: u._id,
        tokenHash: u.verificationTokenHash,
        expiresAt: u.verificationTokenExpiresAt || new Date(Date.now() + 24 * 3600 * 1000),
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
});
print("verification token backfill complete");
```

- [ ] **Step 2: Postgres backfill**

Add a SQL `INSERT … SELECT` (in a migration step that runs BEFORE the column drop in
Task 6) copying `users` rows with a non-null `verification_token_hash` into
`verification_tokens` (`id` via `gen_random_uuid()`-style or the app's id convention,
`user_id = users.id`, `token_hash`, `expires_at`, timestamps `now()`), `ON CONFLICT
(user_id) DO NOTHING`.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-verification-tokens.mongodb.js server/drizzle
git commit -m "chore(repos): backfill scripts for verification-token split"
```

---

## Task 6: Remove inline token fields from `User`

**Files:**
- Modify: `src/repositories/types.ts` (`UserRecord`, `PublicUserRecord`, `UserRepository`)
- Modify: `src/models/User.ts`
- Modify: `src/repositories/mongo/user.repository.ts`
- Modify: `src/repositories/postgres/user.repository.ts`, `postgres/schema.ts`
- Generate: a drizzle migration dropping the two columns
- Test: existing user/repo tests

> Do this LAST — only after the service no longer reads the fields (Task 4) and data is
> backfilled (Task 5).

- [ ] **Step 1: Remove from the record types**

In `src/repositories/types.ts`:
- Delete `verificationTokenHash` and `verificationTokenExpiresAt` from `UserRecord`.
- Update `PublicUserRecord = Omit<UserRecord, "passwordHash">` (drop the now-nonexistent
  `verificationTokenHash` from the Omit).
- Remove `setVerificationToken` from `UserRepository`. Keep `markVerified` but it now sets
  only `isVerified`.

- [ ] **Step 2: Update the model + both repos**

- `src/models/User.ts`: delete the `verificationTokenHash` / `verificationTokenExpiresAt`
  schema fields.
- `mongo/user.repository.ts`: drop those from the record mapper, delete the
  `setVerificationToken` method, and change `markVerified` to `$set: { isVerified: true }`
  only. Update the "safe" projection destructure (it no longer needs to strip
  `verificationTokenHash`).
- `postgres/user.repository.ts`: same — drop from mapper, delete `setVerificationToken`,
  `markVerified` sets only `isVerified`/`updatedAt`, fix the "safe" destructure.
- `postgres/schema.ts`: remove the two `users` columns.

- [ ] **Step 3: Generate the column-drop migration**

Run: `cd server && npm run db:generate`
Expected: a migration dropping `verification_token_hash` / `verification_token_expires_at`.

- [ ] **Step 4: Type-check + run the affected suites**

Run: `cd server && npx tsc -p tsconfig.json --noEmit && npx tsx --test src/auth.service.test.ts src/repositories/registry.test.ts src/repositories/no-direct-model-imports.test.ts`
Expected: no type errors; PASS. Fix any remaining references the compiler flags (e.g.
DTO mappers reading the old fields).

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npm test`
Expected: PASS on the default (mongo) driver.

- [ ] **Step 6: Commit**

```bash
git add server/src/repositories/types.ts server/src/models/User.ts server/src/repositories/mongo/user.repository.ts server/src/repositories/postgres/user.repository.ts server/src/repositories/postgres/schema.ts server/drizzle
git commit -m "refactor(repos): drop inline verification-token fields from User"
```

---

## Task 7: TTL sweep for Postgres

**Files:**
- Modify: `src/ttl/sweeper.ts`
- Test: `src/ttl/sweeper.test.ts` (extend)

**Interfaces:**
- Consumes: `verificationTokens.deleteExpired(now)` (Task 1). Mongo gets TTL from the
  index (Task 2); Postgres relies on the sweeper.

- [ ] **Step 1: Write the failing test**

Extend `src/ttl/sweeper.test.ts` to assert one sweep iteration calls
`verificationTokens.deleteExpired(now)` alongside the existing conversation/pending sweeps
(match the file's existing fake-repo + timer pattern).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx tsx --test src/ttl/sweeper.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the sweep call**

In `src/ttl/sweeper.ts`, where the sweep deletes other expired records, add:

```ts
await getRepositories().verificationTokens.deleteExpired(new Date());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsx --test src/ttl/sweeper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ttl/sweeper.ts server/src/ttl/sweeper.test.ts
git commit -m "feat(ttl): sweep expired verification tokens (Postgres)"
```

---

## Self-Review

- **Spec coverage:** new store across both drivers (T1–T3), service switch (T4), backfill
  (T5), inline-field removal (T6), cleanup (T7). Covers "split the verification tokens to
  a different collection or table."
- **Placeholder scan:** the "match the existing convention" notes (`asSession`, `asPgTx`,
  `newId`, the auth test's repo setup) point at concrete in-repo references rather than
  leaving steps vague — verify-and-mirror, not invent.
- **Type consistency:** `VerificationTokenRecord`, `VerificationTokenRepository`
  (`upsertForUser`/`findByUserId`/`deleteForUser`/`deleteExpired`) are identical across
  the interface, both impls, the service, and the sweeper.

## Open questions (answer later)

1. **History vs single token** — confirm one-active-token-per-user is the intended model
   (this plan), not a token-history/audit table.
2. **Expiry default in backfill** — for any legacy row missing `expiresAt`, the Mongo
   script defaults to now+24h; acceptable, or expire immediately?
3. **Driver scope** — implement both Mongo + Postgres now (this plan), or Mongo-only
   since Postgres is still behind a flag? (Plan does both to keep the seam honest.)
