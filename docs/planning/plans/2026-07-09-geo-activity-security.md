# Geo Activity Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Location-aware security for Virly: IP-geolocated activity events behind the repository seam, geo fraud rules in `computeRisk`, a Security activity view with a map, realtime new-login alerts, and read-only AI/MCP activity tools.

**Architecture:** One new `ActivityEvent` stream written through the repository seam (Mongo + Postgres, contract-tested), stamped at login and transfer execution via a `GeoIpResolver` port (local GeoLite2 mmdb, dev simulation header).
All geo reasoning is pure TypeScript in `server/src/fraud/geo.ts`; three new explainable signals fold into the existing `computeRisk` score so email-confirmation holds come free.
The map UI, realtime alert, and AI tools all read the same per-user event stream; no geospatial database indexes.

**Tech Stack:** Express + TS (NodeNext ESM, `.js` import specifiers), Mongoose 8, Drizzle 0.45 + pg, Jest 29 native ESM (`NODE_OPTIONS=--experimental-vm-modules`), `maxmind` (mmdb reader), React 18.3 + react-router 6, `react-leaflet@4` + `leaflet`, Socket.IO 4, Zod, LangChain `tool()`.

**Spec:** `docs/planning/specs/2026-07-09-geo-activity-security-design.md` (approved).

## Global Constraints

- Server imports use NodeNext ESM `.js` specifiers even between `.ts` files; Jest maps them back.
- Never reach past the repository seam: services/routes/AI tools call `getRepositories()`, never Mongoose/Drizzle directly (exceptions: the fraud AI-Postgres flag tables and `ttl/sweeper.ts`, which already touch Drizzle by design).
- IDs are 24-hex ObjectId strings in both drivers (`newObjectId()` on postgres).
- Config: every new env var resolves through `server/src/config.ts` with `VIRLY_` prefix; validation throws at boot.
- Config values (spec): `VIRLY_GEO_ENABLED` default `true`; `VIRLY_GEOIP_DB_PATH` unset by default; `VIRLY_GEOIP_SIMULATION` default `false` and boot MUST throw if enabled in production; `VIRLY_ACTIVITY_RETENTION_DAYS` default `180`; `VIRLY_MAXMIND_LICENSE_KEY` script-only.
- Fraud rule constants (spec): impossible travel > 900 km/h weight +0.45; new country (trailing 90 days) +0.25; far from home > 500 km +0.10; home undefined below 5 located events; all rules fail open on null.
- Reason copy (spec): "This transfer originates ~{km} km from your activity {m} minutes ago." / "First activity from {country}." / "Far from your usual area."
- Capture is strictly non-blocking: a failed event write logs loudly, never fails login/transfer.
- Events are ALWAYS written when `config.geo.enabled`, even with `geo: null`.
- No offset pagination: the activity list endpoint uses `before` cursor + `limit`.
- No emojis anywhere. Plain dashes, never em dashes.
- Dev geo simulation header: `X-Virly-Dev-Geo: <city>,<CC>,<lat>,<lng>` (e.g. `Paris,FR,48.8566,2.3522`).
- Realtime event name: `security:new-login`. No polling anywhere.
- Client tests: Jest, node env, `renderToStaticMarkup`, no jsdom; map components must render a placeholder without `window`.
- Client is React 18.3: use `react-leaflet@^4.2.1` (v5 requires React 19).
- Commit after every task; conventional-commit messages; never add an agent co-author.

## File Structure (new / modified)

```
server/src/config.ts                          modify: geo config block + validation
server/src/repositories/types.ts              modify: ActivityEvent types + repo interface + Repositories entry
server/src/models/ActivityEvent.ts            create: Mongoose model (TTL index)
server/src/repositories/mongo/activityEvent.repository.ts    create
server/src/repositories/mongo/index.ts        modify: register repo
server/src/repositories/postgres/schema.ts    modify: activity_events table
server/drizzle/0005_activity_events.sql       create: hand-written migration
server/drizzle/meta/_journal.json             modify: register migration
server/src/repositories/postgres/activityEvent.repository.ts create
server/src/repositories/postgres/index.ts     modify: register repo
server/src/ttl/sweeper.ts                     modify: sweep activity_events
server/tests/contract/harness.ts              modify: TRUNCATE activity_events
server/tests/contract/activityEvent.contract.test.ts         create
server/src/geo/types.ts                       create: GeoPoint
server/src/geo/resolver.ts                    create: maxmind resolver singleton
server/src/geo/simulation.ts                  create: dev header parser
server/src/geo/request.ts                     create: resolveRequestOrigin(req)
server/src/geo/__tests__/*.test.ts            create
server/scripts/geo-sync.ts                    create: GeoLite2 download
server/src/services/activityEvent.service.ts  create: recordActivityEventSafe + list
server/src/index.ts                           modify: initGeoResolver at boot
server/src/routes/auth.routes.ts              modify: login capture + alert emit
server/src/services/transfer.service.ts       modify: origin on ExecuteTransferInput; capture in executeTransferWithSession
server/src/routes/transaction.routes.ts       modify: thread origin
server/src/routes/ai.routes.ts                modify: thread origin into confirmation
server/src/services/aiPendingTransfer.service.ts modify: thread origin
server/src/fraud/geo.ts                       create: haversineKm/homeBaseline/travelSpeedKmh/isNewCountry
server/src/fraud/__tests__/geo.test.ts        create
server/src/fraud/risk.ts                      modify: geo signals + flags + weights
server/src/fraud/__tests__/risk.test.ts       modify: geo cases
server/src/fraud/service.ts                   modify: scoreTransfer origin + geo signal precompute
server/src/fraud/__tests__/service.geo.test.ts create
server/src/routes/userProfile.routes.ts       modify (or the file mounted at /api/users): GET /me/activity
server/src/realtime/types.ts                  modify: security:new-login
openapi.yaml                                  modify: /api/users/me/activity
server/src/ai/v2/tools/activity.ts            create: getRecentActivity tool
server/src/ai/v2/tools/descriptions.ts        modify: description
server/src/ai/v2/tools/index.ts               modify: register
server/src/ai/v2/tools/__tests__/activity.test.ts create
server/src/ai/__tests__/aiSafety.activity.test.ts create
server/src/mcp/support.ts                     modify: get_recent_activity tool
server/.env.example                           modify: new vars
docs/configuration.md                         modify: new vars table rows
client/src/lib/api.ts                         modify: activity() + types
client/src/lib/realtime.ts                    modify: onSecurityNewLogin
client/src/lib/__tests__/realtime.test.ts     modify/create: dispatch case
client/src/components/ToastHost.tsx           create: minimal toast context
client/src/features/settings/SecurityTab.tsx  create: list + lazy map host
client/src/features/settings/ActivityMap.tsx  create: leaflet leaf (lazy)
client/src/features/settings/SettingsPage.tsx modify: third tab
client/src/features/settings/__tests__/SecurityTab.test.tsx  create
client/src/features/settings/__stories__/SecurityTab.stories.tsx create
```

Dependency to add (server): `maxmind@^5.0.0`. Dependencies to add (client): `leaflet@^1.9.4`, `react-leaflet@^4.2.1`, dev `@types/leaflet@^1.9.12`.

---

## Phase 1 - Event stream, resolver, capture

### Task 1: Geo config block

**Files:**
- Modify: `server/src/config.ts`
- Test: `server/src/__tests__/config.geo.test.ts` (create)
- Modify: `server/.env.example`, `docs/configuration.md`

**Interfaces:**
- Produces: `config.geo: { enabled: boolean; geoipDbPath: string | undefined; simulationEnabled: boolean; retentionDays: number }` consumed by every later server task.

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/config.geo.test.ts`, copying the `loadConfig` isolate-modules helper style from `server/src/__tests__/config.dbDriver.test.ts`:

```ts
// src/__tests__/config.geo.test.ts
import { jest } from "@jest/globals";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let mod: { config: typeof import("../config.js").config } | undefined;
  await jest.isolateModulesAsync(async () => {
    mod = (await import("../config.js")) as { config: typeof import("../config.js").config };
  });
  process.env = prev;
  return mod!.config;
}

test("geo defaults: enabled, no db path, no simulation, 180 days", async () => {
  const config = await loadConfig({
    VIRLY_GEO_ENABLED: undefined,
    VIRLY_GEOIP_DB_PATH: undefined,
    VIRLY_GEOIP_SIMULATION: undefined,
    VIRLY_ACTIVITY_RETENTION_DAYS: undefined
  });
  expect(config.geo).toStrictEqual({
    enabled: true,
    geoipDbPath: undefined,
    simulationEnabled: false,
    retentionDays: 180
  });
});

test("geo values are read from env", async () => {
  const config = await loadConfig({
    VIRLY_GEO_ENABLED: "false",
    VIRLY_GEOIP_DB_PATH: "/tmp/GeoLite2-City.mmdb",
    VIRLY_GEOIP_SIMULATION: "true",
    VIRLY_ACTIVITY_RETENTION_DAYS: "30",
    NODE_ENV: "development"
  });
  expect(config.geo.enabled).toBe(false);
  expect(config.geo.geoipDbPath).toBe("/tmp/GeoLite2-City.mmdb");
  expect(config.geo.simulationEnabled).toBe(true);
  expect(config.geo.retentionDays).toBe(30);
});

test("simulation enabled in production fails boot", async () => {
  await expect(
    loadConfig({
      NODE_ENV: "production",
      VIRLY_GEOIP_SIMULATION: "true",
      // production also requires a strong JWT secret; satisfy it so THIS rule is what throws
      VIRLY_JWT_SECRET: "a".repeat(40)
    })
  ).rejects.toThrow(/VIRLY_GEOIP_SIMULATION/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npm run test:server -- src/__tests__/config.geo.test.ts`
Expected: FAIL (`config.geo` is undefined).

- [ ] **Step 3: Implement**

In `server/src/config.ts`: import already-present helpers (`getBooleanEnv`, `getIntEnv`, `getOptionalStringEnv` from `./utils/env.js` - check the existing import line and extend it if a helper is missing).
Add near the other feature blocks (e.g. after the fraud block), following the fail-fast style of `resolveJwtSecret`:

```ts
// Geo activity security (spec 2026-07-09). Simulation resolves geo from a dev
// request header, so it MUST never be live in production.
const geoSimulationEnabled = getBooleanEnv("VIRLY_GEOIP_SIMULATION", { defaultValue: false });
if (isProduction && geoSimulationEnabled) {
  throw new Error("VIRLY_GEOIP_SIMULATION must be off in production.");
}
```

And inside the exported `config` object:

```ts
geo: {
  enabled: getBooleanEnv("VIRLY_GEO_ENABLED", { defaultValue: true }),
  geoipDbPath: getOptionalStringEnv("VIRLY_GEOIP_DB_PATH"),
  simulationEnabled: geoSimulationEnabled,
  retentionDays: getIntEnv("VIRLY_ACTIVITY_RETENTION_DAYS", { defaultValue: 180, min: 1 })
},
```

Note: `isProduction` already exists in config.ts (used by `resolveJwtSecret`); reuse it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:server -- src/__tests__/config.geo.test.ts`
Expected: PASS (3 tests).
Also run the whole config suite to catch regressions: `npm run test:server -- src/__tests__`

- [ ] **Step 5: Document the vars**

Append to `server/.env.example`:

```bash
# Geo activity security
VIRLY_GEO_ENABLED=true
# VIRLY_GEOIP_DB_PATH=./data/GeoLite2-City.mmdb
VIRLY_GEOIP_SIMULATION=false
VIRLY_ACTIVITY_RETENTION_DAYS=180
# VIRLY_MAXMIND_LICENSE_KEY= (only used by `npm run geo:sync`)
```

Add matching rows to the env-var table in `docs/configuration.md` (same five variables, same defaults, one line each; follow the table format already used there).

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/src/__tests__/config.geo.test.ts server/.env.example docs/configuration.md
git commit -m "feat(geo): geo config block with production simulation guard"
```

### Task 2: ActivityEvent domain types + Mongo side

**Files:**
- Modify: `server/src/repositories/types.ts`
- Create: `server/src/models/ActivityEvent.ts`
- Create: `server/src/repositories/mongo/activityEvent.repository.ts`
- Modify: `server/src/repositories/mongo/index.ts`
- Test: covered by the contract suite in Task 4 (repositories are only meaningfully testable against real drivers; unit tests here would mock the ORM and prove nothing)

**Interfaces:**
- Produces (in `types.ts`):

```ts
export type ActivityEventGeo = {
  country: string; // ISO 3166-1 alpha-2
  city: string | null;
  lat: number;
  lng: number;
};

export type ActivityEventKind = "login" | "transfer";

export type ActivityEventRecord = {
  id: string;
  userId: string;
  kind: ActivityEventKind;
  at: Date;
  ip: string | null;
  geo: ActivityEventGeo | null;
  transactionId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ActivityEventCreateInput = {
  userId: string;
  kind: ActivityEventKind;
  at: Date;
  ip: string | null;
  geo: ActivityEventGeo | null;
  transactionId?: string | null;
  expiresAt: Date;
};

export interface ActivityEventRepository {
  create(input: ActivityEventCreateInput, tx?: TxContext): Promise<ActivityEventRecord>;
  /** Newest first by (at, id). `before` returns events strictly older than that instant. */
  listRecentByUser(
    userId: string,
    opts: { limit: number; before?: Date },
    tx?: TxContext
  ): Promise<ActivityEventRecord[]>;
  /** Delete all events with expiresAt < now; returns the count removed. */
  deleteExpired(now: Date, tx?: TxContext): Promise<number>;
}
```

- Also add `activityEvents: ActivityEventRepository;` to the `Repositories` interface.
- Retention mechanism note (small deviation from the spec's wording, same intent): rows carry an explicit `expiresAt` (computed by the service as `at + retentionDays`), matching the existing `VerificationToken` pattern, so Mongo TTL-indexes `expiresAt` and the postgres sweeper deletes by it.

- [ ] **Step 1: Add the types**

Add the block above to `server/src/repositories/types.ts` next to the other record/interface groups, and the `activityEvents` entry to `Repositories`.

- [ ] **Step 2: Verify typecheck fails for the drivers**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: FAIL - `createMongoRepositories` / `createPostgresRepositories` no longer satisfy `Repositories` (missing `activityEvents`). This is the compile-time "failing test" for Tasks 2-3.

- [ ] **Step 3: Create the Mongoose model**

Create `server/src/models/ActivityEvent.ts`:

```ts
// src/models/ActivityEvent.ts
import { Schema, model } from "mongoose";

// Account activity audit trail (logins, transfers) with best-effort geo
// enrichment. geo is Mixed so the Mongo driver stores exactly the object the
// service resolved (or null), byte-compatible with the Postgres jsonb column.
const activityEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["login", "transfer"], required: true },
    at: { type: Date, required: true },
    ip: { type: String, default: null },
    geo: { type: Schema.Types.Mixed, default: null },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// The one query shape: a user's recent events, newest first.
activityEventSchema.index({ userId: 1, at: -1 });
// TTL: Mongo drops the doc at expiresAt (retention for free).
activityEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ActivityEvent = model("ActivityEvent", activityEventSchema);
```

- [ ] **Step 4: Create the mongo repository**

Create `server/src/repositories/mongo/activityEvent.repository.ts` (mirrors `verificationToken.repository.ts`):

```ts
// src/repositories/mongo/activityEvent.repository.ts
import { ActivityEvent } from "../../models/ActivityEvent.js";
import type {
  ActivityEventCreateInput,
  ActivityEventGeo,
  ActivityEventKind,
  ActivityEventRecord,
  ActivityEventRepository,
  TxContext
} from "../types.js";
import { asSession } from "./transaction.js";

function toActivityEventRecord(d: Record<string, unknown>): ActivityEventRecord {
  return {
    id: String(d._id),
    userId: String(d.userId),
    kind: d.kind as ActivityEventKind,
    at: d.at as Date,
    ip: (d.ip as string | null) ?? null,
    geo: (d.geo as ActivityEventGeo | null) ?? null,
    transactionId: d.transactionId ? String(d.transactionId) : null,
    expiresAt: d.expiresAt as Date,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoActivityEventRepository: ActivityEventRepository = {
  async create(input: ActivityEventCreateInput, tx?: TxContext) {
    const [doc] = await ActivityEvent.create(
      [
        {
          userId: input.userId,
          kind: input.kind,
          at: input.at,
          ip: input.ip,
          geo: input.geo,
          transactionId: input.transactionId ?? null,
          expiresAt: input.expiresAt
        }
      ],
      { session: asSession(tx) }
    );
    if (!doc) throw new Error("activityEvents.create returned no document");
    return toActivityEventRecord(doc.toObject() as Record<string, unknown>);
  },

  async listRecentByUser(userId, opts, tx?: TxContext) {
    const filter: Record<string, unknown> = { userId };
    if (opts.before) filter.at = { $lt: opts.before };
    const docs = await ActivityEvent.find(filter, null, { session: asSession(tx) })
      .sort({ at: -1, _id: -1 })
      .limit(opts.limit)
      .lean();
    return docs.map((d) => toActivityEventRecord(d as Record<string, unknown>));
  },

  async deleteExpired(now, tx?: TxContext) {
    const res = await ActivityEvent.deleteMany(
      { expiresAt: { $lt: now } },
      { session: asSession(tx) }
    );
    return res.deletedCount ?? 0;
  }
};
```

- [ ] **Step 5: Register in the mongo driver set**

In `server/src/repositories/mongo/index.ts`, import `mongoActivityEventRepository` and add `activityEvents: mongoActivityEventRepository,` to the object returned by `createMongoRepositories()` (match how `verificationTokens` is wired there).

- [ ] **Step 6: Typecheck again**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: still FAIL, but now ONLY for the postgres driver set (mongo satisfied). That is the handoff condition for Task 3.

- [ ] **Step 7: Commit**

```bash
git add server/src/repositories/types.ts server/src/models/ActivityEvent.ts server/src/repositories/mongo/activityEvent.repository.ts server/src/repositories/mongo/index.ts
git commit -m "feat(geo): ActivityEvent domain types and mongo repository"
```

### Task 3: Postgres side - schema, migration, repository, sweeper

**Files:**
- Modify: `server/src/repositories/postgres/schema.ts`
- Create: `server/drizzle/0005_activity_events.sql`
- Modify: `server/drizzle/meta/_journal.json`
- Create: `server/src/repositories/postgres/activityEvent.repository.ts`
- Modify: `server/src/repositories/postgres/index.ts`
- Modify: `server/src/ttl/sweeper.ts`

**Interfaces:**
- Consumes: Task 2's `ActivityEventRepository` interface and `newObjectId()` from `server/src/repositories/postgres/id.ts`.
- Produces: `activityEvents` in the postgres driver set; `activity_events` table swept by `sweepExpired`.

- [ ] **Step 1: Add the table to schema.ts**

In `server/src/repositories/postgres/schema.ts`, using the existing `id()`, `createdAt()`, `updatedAt()` helpers and the imports already at the top (`pgTable, char, text, timestamp, jsonb, index` - extend the drizzle-orm/pg-core import if `jsonb` or `index` is missing):

```ts
export const activityEvents = pgTable("activity_events", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  kind: text("kind").notNull(), // "login" | "transfer" (CHECK in migration)
  at: timestamp("at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  geo: jsonb("geo"),
  transactionId: char("transaction_id", { length: 24 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("activity_events_user_at_idx").on(t.userId, t.at)
]);
```

- [ ] **Step 2: Hand-write the migration**

drizzle-kit generate has a known version-mismatch problem in this repo (the 0005_contacts.sql precedent on another branch was hand-written for the same reason), so hand-write this one too.
First read `server/drizzle/0001_held_status.sql` and one journal entry in `server/drizzle/meta/_journal.json` to confirm the local style, then create `server/drizzle/0005_activity_events.sql`:

```sql
CREATE TABLE "activity_events" (
  "id" char(24) PRIMARY KEY NOT NULL,
  "user_id" char(24) NOT NULL,
  "kind" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "ip" text,
  "geo" jsonb,
  "transaction_id" char(24),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "activity_events_kind_check" CHECK ("kind" IN ('login', 'transfer'))
);
--> statement-breakpoint
CREATE INDEX "activity_events_user_at_idx" ON "activity_events" ("user_id", "at");
--> statement-breakpoint
CREATE INDEX "activity_events_expires_at_idx" ON "activity_events" ("expires_at");
```

Append a matching entry to the `entries` array in `server/drizzle/meta/_journal.json`, copying the previous entry's shape exactly (same `version`, `breakpoints: true`) with `idx: 5`, `tag: "0005_activity_events"`, and `when` set to the current epoch milliseconds (`date +%s%3N`).
Do NOT edit `drizzle/meta/*_snapshot.json` files; `migrate()` only reads the journal + SQL.

- [ ] **Step 3: Create the postgres repository**

Create `server/src/repositories/postgres/activityEvent.repository.ts`:

```ts
// src/repositories/postgres/activityEvent.repository.ts
import { and, desc, eq, lt } from "drizzle-orm";
import { activityEvents } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type {
  ActivityEventCreateInput,
  ActivityEventGeo,
  ActivityEventKind,
  ActivityEventRecord,
  ActivityEventRepository,
  TxContext
} from "../types.js";

type Row = typeof activityEvents.$inferSelect;

function toRecord(r: Row): ActivityEventRecord {
  return {
    id: r.id,
    userId: r.userId,
    kind: r.kind as ActivityEventKind,
    at: r.at,
    ip: r.ip ?? null,
    geo: (r.geo as ActivityEventGeo | null) ?? null,
    transactionId: r.transactionId ?? null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresActivityEventRepository: ActivityEventRepository = {
  async create(input: ActivityEventCreateInput, tx?: TxContext): Promise<ActivityEventRecord> {
    const now = new Date();
    const [row] = await asPgTx(tx)
      .insert(activityEvents)
      .values({
        id: newObjectId(),
        userId: input.userId,
        kind: input.kind,
        at: input.at,
        ip: input.ip,
        geo: input.geo,
        transactionId: input.transactionId ?? null,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!row) throw new Error("activityEvents.create returned no row");
    return toRecord(row);
  },

  async listRecentByUser(
    userId: string,
    opts: { limit: number; before?: Date },
    tx?: TxContext
  ): Promise<ActivityEventRecord[]> {
    const where = opts.before
      ? and(eq(activityEvents.userId, userId), lt(activityEvents.at, opts.before))
      : eq(activityEvents.userId, userId);
    const rows = await asPgTx(tx)
      .select()
      .from(activityEvents)
      .where(where)
      .orderBy(desc(activityEvents.at), desc(activityEvents.id))
      .limit(opts.limit);
    return rows.map(toRecord);
  },

  async deleteExpired(now: Date, tx?: TxContext): Promise<number> {
    const rows = await asPgTx(tx)
      .delete(activityEvents)
      .where(lt(activityEvents.expiresAt, now))
      .returning({ id: activityEvents.id });
    return rows.length;
  }
};
```

- [ ] **Step 4: Register + sweep**

In `server/src/repositories/postgres/index.ts`, import and add `activityEvents: postgresActivityEventRepository,` (match `verificationTokens` wiring).
In `server/src/ttl/sweeper.ts`, extend the imports and `sweepExpired` with one line, matching the existing three:

```ts
import { activityEvents, aiConversations, aiPendingTransfers, verificationTokens } from "../repositories/postgres/schema.js";
// ... inside sweepExpired:
await db.delete(activityEvents).where(lt(activityEvents.expiresAt, now));
```

- [ ] **Step 5: Typecheck passes**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS (both driver sets now satisfy `Repositories`).

- [ ] **Step 6: Commit**

```bash
git add server/src/repositories/postgres server/drizzle server/src/ttl/sweeper.ts
git commit -m "feat(geo): activity_events postgres schema, migration, repository, TTL sweep"
```

### Task 4: Contract suite for ActivityEventRepository

**Files:**
- Modify: `server/tests/contract/harness.ts` (add `"activity_events"` to `PG_TABLES`)
- Create: `server/tests/contract/activityEvent.contract.test.ts`

**Interfaces:**
- Consumes: Task 2/3 repositories via `describeContract` from `./harness.js`.

- [ ] **Step 1: Add the table to the harness TRUNCATE list**

In `server/tests/contract/harness.ts`, add `"activity_events"` to the `PG_TABLES` array (order within the list does not matter; TRUNCATE is CASCADE).

- [ ] **Step 2: Write the contract cases**

Create `server/tests/contract/activityEvent.contract.test.ts`:

```ts
// server/tests/contract/activityEvent.contract.test.ts
import { describeContract } from "./harness.js";
import type { Repositories, ActivityEventCreateInput } from "../../src/repositories/types.js";

async function createUser(repos: Repositories, suffix = "") {
  return repos.users.create({
    email: `activity-contract${suffix}@test.com`,
    passwordHash: "hash",
    phone: "+9720000000",
    balance: 0
  });
}

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };

function eventInput(userId: string, overrides: Partial<ActivityEventCreateInput> = {}): ActivityEventCreateInput {
  return {
    userId,
    kind: "login",
    at: new Date("2026-07-01T10:00:00.000Z"),
    ip: "203.0.113.7",
    geo: TLV,
    expiresAt: new Date("2026-12-28T10:00:00.000Z"),
    ...overrides
  };
}

describeContract("ActivityEventRepository", {
  "create returns a 24-hex id and round-trips every field": async ({ repos }) => {
    const user = await createUser(repos);
    const created = await repos.activityEvents.create(eventInput(user.id));
    expect(created.id).toMatch(/^[0-9a-f]{24}$/i);
    expect(created.userId).toBe(user.id);
    expect(created.kind).toBe("login");
    expect(created.at.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(created.ip).toBe("203.0.113.7");
    expect(created.geo).toStrictEqual(TLV);
    expect(created.transactionId).toBeNull();
    expect(created.expiresAt.toISOString()).toBe("2026-12-28T10:00:00.000Z");
  },

  "create accepts null ip and null geo (unresolvable request)": async ({ repos }) => {
    const user = await createUser(repos);
    const created = await repos.activityEvents.create(
      eventInput(user.id, { ip: null, geo: null })
    );
    expect(created.ip).toBeNull();
    expect(created.geo).toBeNull();
  },

  "transfer events keep their transactionId": async ({ repos }) => {
    const user = await createUser(repos);
    const txId = "6867f00000000000000000ab";
    const created = await repos.activityEvents.create(
      eventInput(user.id, { kind: "transfer", transactionId: txId })
    );
    expect(created.kind).toBe("transfer");
    expect(created.transactionId).toBe(txId);
  },

  "listRecentByUser is newest-first and scoped to the user": async ({ repos }) => {
    const a = await createUser(repos, "-a");
    const b = await createUser(repos, "-b");
    await repos.activityEvents.create(eventInput(a.id, { at: new Date("2026-07-01T08:00:00Z") }));
    await repos.activityEvents.create(eventInput(a.id, { at: new Date("2026-07-01T09:00:00Z") }));
    await repos.activityEvents.create(eventInput(b.id, { at: new Date("2026-07-01T10:00:00Z") }));
    const list = await repos.activityEvents.listRecentByUser(a.id, { limit: 10 });
    expect(list.map((e) => e.at.toISOString())).toStrictEqual([
      "2026-07-01T09:00:00.000Z",
      "2026-07-01T08:00:00.000Z"
    ]);
    expect(list.every((e) => e.userId === a.id)).toBe(true);
  },

  "listRecentByUser honors limit and the before cursor": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T08:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T09:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T10:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { at: new Date("2026-07-01T11:00:00Z") }));
    const page1 = await repos.activityEvents.listRecentByUser(user.id, { limit: 2 });
    expect(page1).toHaveLength(2);
    const page2 = await repos.activityEvents.listRecentByUser(user.id, {
      limit: 2,
      before: page1[1]!.at
    });
    expect(page2).toHaveLength(2);
    const all = [...page1, ...page2].map((e) => e.at.getTime());
    expect(new Set(all).size).toBe(4);
    expect([...all].sort((x, y) => y - x)).toStrictEqual(all);
  },

  "deleteExpired removes only past-expiry rows and reports the count": async ({ repos }) => {
    const user = await createUser(repos);
    await repos.activityEvents.create(eventInput(user.id, { expiresAt: new Date("2026-01-01T00:00:00Z") }));
    await repos.activityEvents.create(eventInput(user.id, { expiresAt: new Date("2027-01-01T00:00:00Z") }));
    const removed = await repos.activityEvents.deleteExpired(new Date("2026-06-01T00:00:00Z"));
    expect(removed).toBe(1);
    const remaining = await repos.activityEvents.listRecentByUser(user.id, { limit: 10 });
    expect(remaining).toHaveLength(1);
  }
});
```

- [ ] **Step 3: Run without databases (self-skip)**

Run: `npm run test:contract --workspace server`
Expected: the new suite appears as skipped (both drivers), nothing fails.

- [ ] **Step 4: Run against both real databases**

```bash
docker compose -f docker-compose.test.yml up -d
CONTRACT_PG_URL=postgres://virly:virly@localhost:5433/virly \
CONTRACT_MONGO_URL="mongodb://localhost:27018/virly_contract?directConnection=true" \
  npm run test:contract --workspace server -- -t "ActivityEventRepository"
```

Expected: PASS for `[postgres] ActivityEventRepository` and `[mongo] ActivityEventRepository` (6 cases each).
If mongo dies with exit 14 ("too many open files"), the compose ulimits fix from PR #41 is missing on this branch - cherry-pick commit `e8048a0` or merge main first.

- [ ] **Step 5: Commit**

```bash
git add server/tests/contract/harness.ts server/tests/contract/activityEvent.contract.test.ts
git commit -m "test(geo): ActivityEventRepository contract suite across both drivers"
```

### Task 5: GeoIpResolver - maxmind + simulation + request helper

**Files:**
- Modify: `server/package.json` (add `maxmind`)
- Create: `server/src/geo/types.ts`, `server/src/geo/resolver.ts`, `server/src/geo/simulation.ts`, `server/src/geo/request.ts`
- Modify: `server/src/index.ts` (boot init)
- Test: `server/src/geo/__tests__/simulation.test.ts`, `server/src/geo/__tests__/request.test.ts`

**Interfaces:**
- Produces:
  - `GeoPoint` (alias of `ActivityEventGeo` re-exported from `geo/types.ts`)
  - `initGeoResolver(): Promise<void>` and `resolveIp(ip: string): GeoPoint | null` from `geo/resolver.ts`
  - `parseDevGeoHeader(value: string | undefined): GeoPoint | null` from `geo/simulation.ts`
  - `resolveRequestOrigin(req: Request): RequestOrigin` from `geo/request.ts` where `type RequestOrigin = { ip: string | null; geo: GeoPoint | null }`
- Consumers: auth route, transaction route, ai route, fraud service.

- [ ] **Step 1: Add the dependency**

Run from repo root: `npm install maxmind@^5 --workspace server`

- [ ] **Step 2: Write failing tests for the pure parts**

Create `server/src/geo/__tests__/simulation.test.ts`:

```ts
// src/geo/__tests__/simulation.test.ts
import { parseDevGeoHeader } from "../simulation.js";

test("parses 'city,CC,lat,lng'", () => {
  expect(parseDevGeoHeader("Paris,FR,48.8566,2.3522")).toStrictEqual({
    country: "FR",
    city: "Paris",
    lat: 48.8566,
    lng: 2.3522
  });
});

test("uppercases country and trims parts", () => {
  expect(parseDevGeoHeader(" Tel Aviv , il , 32.0853 , 34.7818 ")).toStrictEqual({
    country: "IL",
    city: "Tel Aviv",
    lat: 32.0853,
    lng: 34.7818
  });
});

test.each([
  [undefined],
  [""],
  ["Paris,FR"],
  ["Paris,FRA,48.8,2.3"],
  ["Paris,FR,not-a-number,2.3"],
  ["Paris,FR,91,2.3"],
  ["Paris,FR,48.8,181"]
])("rejects malformed header %p", (value) => {
  expect(parseDevGeoHeader(value as string | undefined)).toBeNull();
});
```

Create `server/src/geo/__tests__/request.test.ts` (the request helper is pure given a req-shaped object):

```ts
// src/geo/__tests__/request.test.ts
import { jest } from "@jest/globals";

type FakeReq = { ip?: string; header: (name: string) => string | undefined };

function fakeReq(ip: string | undefined, devGeo?: string): FakeReq {
  return { ip, header: (name) => (name === "X-Virly-Dev-Geo" ? devGeo : undefined) };
}

async function loadRequestModule(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let mod: typeof import("../request.js") | undefined;
  await jest.isolateModulesAsync(async () => {
    mod = await import("../request.js");
  });
  process.env = prev;
  return mod!;
}

test("simulation on: dev header wins and ip is still recorded", async () => {
  const { resolveRequestOrigin } = await loadRequestModule({ VIRLY_GEOIP_SIMULATION: "true" });
  const origin = resolveRequestOrigin(fakeReq("127.0.0.1", "Paris,FR,48.8566,2.3522") as never);
  expect(origin.ip).toBe("127.0.0.1");
  expect(origin.geo?.city).toBe("Paris");
});

test("simulation off: dev header is ignored (unresolvable local ip -> null geo)", async () => {
  const { resolveRequestOrigin } = await loadRequestModule({ VIRLY_GEOIP_SIMULATION: "false" });
  const origin = resolveRequestOrigin(fakeReq("127.0.0.1", "Paris,FR,48.8566,2.3522") as never);
  expect(origin.ip).toBe("127.0.0.1");
  expect(origin.geo).toBeNull();
});

test("missing ip yields null ip and null geo", async () => {
  const { resolveRequestOrigin } = await loadRequestModule({ VIRLY_GEOIP_SIMULATION: "true" });
  const origin = resolveRequestOrigin(fakeReq(undefined) as never);
  expect(origin).toStrictEqual({ ip: null, geo: null });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:server -- src/geo`
Expected: FAIL (modules do not exist).

- [ ] **Step 4: Implement the geo modules**

`server/src/geo/types.ts`:

```ts
// src/geo/types.ts
import type { ActivityEventGeo } from "../repositories/types.js";

export type GeoPoint = ActivityEventGeo;
export type RequestOrigin = { ip: string | null; geo: GeoPoint | null };
```

`server/src/geo/simulation.ts`:

```ts
// src/geo/simulation.ts
import type { GeoPoint } from "./types.js";

/** Dev-only header format: "city,CC,lat,lng" (e.g. "Paris,FR,48.8566,2.3522"). */
export function parseDevGeoHeader(value: string | undefined): GeoPoint | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => p.trim());
  if (parts.length !== 4) return null;
  const [city, country, latRaw, lngRaw] = parts as [string, string, string, string];
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!city || !/^[A-Za-z]{2}$/.test(country)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { country: country.toUpperCase(), city, lat, lng };
}
```

`server/src/geo/resolver.ts`:

```ts
// src/geo/resolver.ts
//
// GeoIpResolver port. The MaxMind GeoLite2-City database is loaded once at
// boot from config.geo.geoipDbPath; a missing/corrupt file degrades softly
// (warn once, every lookup resolves null) per the spec's fail-open rule.
import maxmind, { type CityResponse, type Reader } from "maxmind";

import { config } from "../config.js";
import type { GeoPoint } from "./types.js";

let reader: Reader<CityResponse> | null = null;

export async function initGeoResolver(): Promise<void> {
  if (!config.geo.enabled || !config.geo.geoipDbPath) return;
  try {
    reader = await maxmind.open<CityResponse>(config.geo.geoipDbPath);
  } catch (error) {
    console.warn(
      `geo: could not load GeoLite2 db at ${config.geo.geoipDbPath}; IP lookups disabled.`,
      error instanceof Error ? error.message : error
    );
    reader = null;
  }
}

/** Test seam. */
export function setGeoReaderForTests(r: Reader<CityResponse> | null): void {
  reader = r;
}

export function resolveIp(ip: string): GeoPoint | null {
  if (!reader) return null;
  try {
    const hit = reader.get(ip);
    const lat = hit?.location?.latitude;
    const lng = hit?.location?.longitude;
    const country = hit?.country?.iso_code;
    if (typeof lat !== "number" || typeof lng !== "number" || !country) return null;
    return { country, city: hit?.city?.names?.en ?? null, lat, lng };
  } catch {
    return null;
  }
}
```

`server/src/geo/request.ts`:

```ts
// src/geo/request.ts
import type { Request } from "express";

import { config } from "../config.js";
import { resolveIp } from "./resolver.js";
import { parseDevGeoHeader } from "./simulation.js";
import type { RequestOrigin } from "./types.js";

export const DEV_GEO_HEADER = "X-Virly-Dev-Geo";

/**
 * Where did this request come from? IP always (trust proxy is set in app.ts),
 * geo best-effort: the dev simulation header when enabled (config.ts already
 * refuses simulation in production), else the mmdb lookup.
 */
export function resolveRequestOrigin(req: Request): RequestOrigin {
  const ip = req.ip ?? null;
  if (config.geo.simulationEnabled) {
    const simulated = parseDevGeoHeader(req.header(DEV_GEO_HEADER));
    if (simulated) return { ip, geo: simulated };
  }
  if (!ip) return { ip: null, geo: null };
  return { ip, geo: resolveIp(ip) };
}
```

Boot wiring in `server/src/index.ts`: add `import { initGeoResolver } from "./geo/resolver.js";` and call `await initGeoResolver();` right after `await initRepositories();`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:server -- src/geo`
Expected: PASS. Then `npx tsc -p server/tsconfig.json --noEmit` - PASS.

- [ ] **Step 6: Commit**

```bash
git add server/package.json package-lock.json server/src/geo server/src/index.ts
git commit -m "feat(geo): GeoIpResolver port with maxmind backend and dev simulation header"
```

### Task 6: geo:sync download script

**Files:**
- Create: `server/scripts/geo-sync.ts`
- Modify: `server/package.json` (script), `server/.gitignore` (or root `.gitignore` - wherever server artifacts are ignored; check first)

**Interfaces:**
- Consumes: `VIRLY_MAXMIND_LICENSE_KEY` from the environment (script-only, deliberately not in config.ts).
- Produces: `server/data/GeoLite2-City.mmdb` on disk.

- [ ] **Step 1: Write the script**

Create `server/scripts/geo-sync.ts` (mirrors the rag:sync "operational script" style - imperative, logs to stdout, exits non-zero on failure):

```ts
// scripts/geo-sync.ts
//
// Download the free MaxMind GeoLite2-City database into server/data/.
// Requires VIRLY_MAXMIND_LICENSE_KEY (free MaxMind account). The tarball
// contains a dated folder; we extract just the .mmdb into place.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const licenseKey = process.env.VIRLY_MAXMIND_LICENSE_KEY ?? process.env.MAXMIND_LICENSE_KEY;
if (!licenseKey) {
  console.error("VIRLY_MAXMIND_LICENSE_KEY is required (free key: https://www.maxmind.com).");
  process.exit(1);
}

const url =
  "https://download.maxmind.com/app/geoip_download" +
  `?edition_id=GeoLite2-City&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`;

async function main() {
  const work = join(tmpdir(), `virly-geolite-${process.pid}`);
  mkdirSync(work, { recursive: true });
  console.log("Downloading GeoLite2-City...");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} (check the license key).`);
  }
  const tarball = join(work, "GeoLite2-City.tar.gz");
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", tarball, "-C", work]);
  const extracted = readdirSync(work).find((d) => d.startsWith("GeoLite2-City_"));
  if (!extracted) throw new Error("Unexpected tarball layout: no GeoLite2-City_* folder.");
  const target = join(process.cwd(), "data");
  mkdirSync(target, { recursive: true });
  renameSync(join(work, extracted, "GeoLite2-City.mmdb"), join(target, "GeoLite2-City.mmdb"));
  rmSync(work, { recursive: true, force: true });
  console.log(`Done: ${join(target, "GeoLite2-City.mmdb")}`);
  console.log("Set VIRLY_GEOIP_DB_PATH=./data/GeoLite2-City.mmdb in server/.env");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script and gitignore**

In `server/package.json` scripts, next to `rag:sync`: `"geo:sync": "tsx scripts/geo-sync.ts"`.
Ensure `server/data/` (or at minimum `*.mmdb`) is gitignored - check `server/.gitignore` and the root `.gitignore` first; add `server/data/` where the other server artifacts are ignored.

- [ ] **Step 3: Verify**

Without a key: `npm run geo:sync --workspace server` - Expected: exits 1 with the "required" message.
With a key (if available): run again - Expected: `Done: .../data/GeoLite2-City.mmdb` and `git status` stays clean.
Typecheck: `npx tsc -p server/tsconfig.json --noEmit` - PASS (scripts are inside the server tsconfig; if `server/tsconfig.json` excludes `scripts/`, confirm `rag`/fraud scripts' precedent and match it).

- [ ] **Step 4: Commit**

```bash
git add server/scripts/geo-sync.ts server/package.json .gitignore server/.gitignore
git commit -m "feat(geo): geo:sync script to download GeoLite2-City"
```

### Task 7: Activity capture service + login capture

**Files:**
- Create: `server/src/services/activityEvent.service.ts`
- Modify: `server/src/routes/auth.routes.ts`
- Test: `server/src/services/__tests__/activityEvent.service.test.ts`

**Interfaces:**
- Consumes: `getRepositories()`, `config.geo`, `RequestOrigin` from Task 5.
- Produces:

```ts
export type RecordActivityInput = {
  userId: string;
  kind: ActivityEventKind;          // "login" | "transfer"
  origin: RequestOrigin;            // { ip, geo }
  transactionId?: string | null;
  now?: Date;                       // test seam
};
// Fire-and-forget: never throws; returns the record or null (disabled/failed).
export async function recordActivityEventSafe(input: RecordActivityInput, tx?: TxContext): Promise<ActivityEventRecord | null>;
export async function listActivityForUser(userId: string, opts: { limit: number; before?: Date }): Promise<ActivityEventRecord[]>;
```

- [ ] **Step 1: Write the failing test**

Create `server/src/services/__tests__/activityEvent.service.test.ts`.
Use the repository singleton as the seam: `setRepositories()` with a minimal in-memory fake (only `activityEvents` is touched), `clearRepositories()` in `afterEach`.

```ts
// src/services/__tests__/activityEvent.service.test.ts
import { jest } from "@jest/globals";
import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventCreateInput, ActivityEventRecord, Repositories } from "../../repositories/types.js";

function fakeRepos(overrides: { createImpl?: (input: ActivityEventCreateInput) => Promise<ActivityEventRecord> } = {}) {
  const created: ActivityEventCreateInput[] = [];
  const record = (input: ActivityEventCreateInput): ActivityEventRecord => ({
    id: "6867f00000000000000000aa",
    userId: input.userId,
    kind: input.kind,
    at: input.at,
    ip: input.ip,
    geo: input.geo,
    transactionId: input.transactionId ?? null,
    expiresAt: input.expiresAt,
    createdAt: input.at,
    updatedAt: input.at
  });
  const repos = {
    activityEvents: {
      async create(input: ActivityEventCreateInput) {
        created.push(input);
        return overrides.createImpl ? overrides.createImpl(input) : record(input);
      },
      async listRecentByUser() {
        return [];
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
  return { repos, created };
}

afterEach(() => clearRepositories());

test("records an event with expiresAt = at + retentionDays", async () => {
  const { repos, created } = fakeRepos();
  setRepositories(repos);
  const { recordActivityEventSafe } = await import("../activityEvent.service.js");
  const now = new Date("2026-07-01T10:00:00.000Z");
  const rec = await recordActivityEventSafe({
    userId: "u1",
    kind: "login",
    origin: { ip: "203.0.113.7", geo: { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 } },
    now
  });
  expect(rec).not.toBeNull();
  expect(created).toHaveLength(1);
  expect(created[0]!.at).toStrictEqual(now);
  // default retention is 180 days
  expect(created[0]!.expiresAt.getTime()).toBe(now.getTime() + 180 * 24 * 60 * 60 * 1000);
});

test("never throws when the write fails; logs and returns null", async () => {
  const { repos } = fakeRepos({
    createImpl: async () => {
      throw new Error("db down");
    }
  });
  setRepositories(repos);
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const { recordActivityEventSafe } = await import("../activityEvent.service.js");
  const rec = await recordActivityEventSafe({
    userId: "u1",
    kind: "transfer",
    origin: { ip: null, geo: null },
    transactionId: "6867f00000000000000000ab"
  });
  expect(rec).toBeNull();
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});
```

Note: `config.geo.enabled === false` short-circuiting is covered implicitly (default is true here); do not fight the config module in this test file - the boolean gate is one line, reviewed by eye.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:server -- src/services/__tests__/activityEvent.service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `server/src/services/activityEvent.service.ts`:

```ts
// src/services/activityEvent.service.ts
//
// The activity stream is an audit trail (spec 2026-07-09): events are ALWAYS
// written when the feature is enabled, geo enrichment is best-effort, and a
// failed write must never fail the login/transfer it describes.
import { config } from "../config.js";
import type { RequestOrigin } from "../geo/types.js";
import { getRepositories } from "../repositories/index.js";
import type { ActivityEventKind, ActivityEventRecord, TxContext } from "../repositories/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecordActivityInput = {
  userId: string;
  kind: ActivityEventKind;
  origin: RequestOrigin;
  transactionId?: string | null;
  now?: Date;
};

export async function recordActivityEventSafe(
  input: RecordActivityInput,
  tx?: TxContext
): Promise<ActivityEventRecord | null> {
  if (!config.geo.enabled) return null;
  const at = input.now ?? new Date();
  try {
    return await getRepositories().activityEvents.create(
      {
        userId: input.userId,
        kind: input.kind,
        at,
        ip: input.origin.ip,
        geo: input.origin.geo,
        transactionId: input.transactionId ?? null,
        expiresAt: new Date(at.getTime() + config.geo.retentionDays * DAY_MS)
      },
      tx
    );
  } catch (error) {
    console.error("activity: failed to record event", {
      userId: input.userId,
      kind: input.kind,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

export async function listActivityForUser(
  userId: string,
  opts: { limit: number; before?: Date }
): Promise<ActivityEventRecord[]> {
  return getRepositories().activityEvents.listRecentByUser(userId, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:server -- src/services/__tests__/activityEvent.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Capture logins**

In `server/src/routes/auth.routes.ts`, in the `POST /login` handler after `setAuthCookies(res, user.id, { rememberMe })` and before the response:

```ts
const origin = resolveRequestOrigin(req);
void recordActivityEventSafe({ userId: user.id, kind: "login", origin });
```

Imports: `import { resolveRequestOrigin } from "../geo/request.js";` and `import { recordActivityEventSafe } from "../services/activityEvent.service.js";`.
`void` is deliberate: login latency must not wait on the audit write (the alert emit in Task 13 will chain onto this promise instead - see that task).

- [ ] **Step 6: Typecheck + full server unit suite**

Run: `npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/activityEvent.service.ts server/src/services/__tests__/activityEvent.service.test.ts server/src/routes/auth.routes.ts
git commit -m "feat(geo): activity event capture service + login capture"
```

### Task 8: Transfer origin threading + transfer capture

**Files:**
- Modify: `server/src/services/transfer.service.ts`
- Modify: `server/src/routes/transaction.routes.ts`
- Modify: `server/src/routes/ai.routes.ts`
- Modify: `server/src/services/aiPendingTransfer.service.ts`
- Test: `server/src/services/__tests__/transfer.origin.test.ts` (create)

**Interfaces:**
- Consumes: `RequestOrigin`, `recordActivityEventSafe`.
- Produces: `ExecuteTransferInput` gains `origin?: RequestOrigin | null`; `respondToAiPendingTransfer`'s input gains `origin?: RequestOrigin | null` and threads it through.
- The capture happens ONCE, inside `executeTransferWithSession`, immediately after `createdTransactions` exists, using the sender transaction id and the same `tx` (atomic with the transfer; wrapped by the service's own try/catch so it still cannot fail the transfer).

- [ ] **Step 1: Write the failing test**

Create `server/src/services/__tests__/transfer.origin.test.ts`.
Fake `Repositories` with just enough for `executeTransferWithSession`: `users.findById`, `users.findByEmail`, `users.setBalance`, `transactions.createMany`, `activityEvents.create`.

```ts
// src/services/__tests__/transfer.origin.test.ts
import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventCreateInput, Repositories } from "../../repositories/types.js";

function worldRepos() {
  const activityCreates: ActivityEventCreateInput[] = [];
  const users = [
    { id: "6867f000000000000000000a", email: "sender@test.com", balance: 500 },
    { id: "6867f000000000000000000b", email: "rcpt@test.com", balance: 10 }
  ];
  const repos = {
    users: {
      async findById(id: string) {
        return users.find((u) => u.id === id) ?? null;
      },
      async findByEmail(email: string) {
        return users.find((u) => u.email === email) ?? null;
      },
      async setBalance() {}
    },
    transactions: {
      async createMany(inputs: Array<Record<string, unknown>>) {
        return inputs.map((input, i) => ({
          ...input,
          id: String(i).padStart(24, "d"), // 24-hex-shaped fake ids: "000...0" / "000...1" with d-padding
          createdAt: new Date(),
          updatedAt: new Date()
        }));
      }
    },
    activityEvents: {
      async create(input: ActivityEventCreateInput) {
        activityCreates.push(input);
        return { ...input, id: "6867f00000000000000000aa", transactionId: input.transactionId ?? null, createdAt: input.at, updatedAt: input.at };
      },
      async listRecentByUser() {
        return [];
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
  return { repos, activityCreates };
}

afterEach(() => clearRepositories());

test("executeTransferWithSession records a located transfer event for the sender", async () => {
  const { repos, activityCreates } = worldRepos();
  setRepositories(repos);
  const { executeTransferWithSession } = await import("../transfer.service.js");
  const result = await executeTransferWithSession(
    {
      senderId: "6867f000000000000000000a",
      recipientEmail: "rcpt@test.com",
      amount: 50,
      origin: { ip: "203.0.113.7", geo: { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 } }
    },
    undefined
  );
  expect(activityCreates).toHaveLength(1);
  expect(activityCreates[0]!.kind).toBe("transfer");
  expect(activityCreates[0]!.userId).toBe("6867f000000000000000000a");
  expect(activityCreates[0]!.geo?.city).toBe("Paris");
  expect(activityCreates[0]!.transactionId).toBe(result.transaction.id);
});

test("no origin -> no event, and a failing event write does not fail the transfer", async () => {
  const { repos, activityCreates } = worldRepos();
  setRepositories(repos);
  const { executeTransferWithSession } = await import("../transfer.service.js");
  await executeTransferWithSession(
    { senderId: "6867f000000000000000000a", recipientEmail: "rcpt@test.com", amount: 50 },
    undefined
  );
  expect(activityCreates).toHaveLength(0);
});
```

Adjust the fake `transactions.createMany` return shape to whatever `toTransactionDto` needs (read `transfer.service.ts` first; add missing fields like `ownerId`, `counterpartyEmail`, `amount`, `type`, `directionLabel`, `reason` to the returned objects - the inputs already carry them).
The `tx` second argument is `undefined` in tests; both fakes ignore it, matching how `runInTransaction` is bypassed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:server -- src/services/__tests__/transfer.origin.test.ts`
Expected: FAIL (`origin` not accepted / no event recorded).

- [ ] **Step 3: Implement the threading**

1. `server/src/services/transfer.service.ts`:
   - `import type { RequestOrigin } from "../geo/types.js";` and `import { recordActivityEventSafe } from "./activityEvent.service.js";`
   - Add `origin?: RequestOrigin | null;` to `ExecuteTransferInput`.
   - In `executeTransferWithSession`, right after the `senderTransaction` null-check and before `return`:

```ts
if (input.origin) {
  await recordActivityEventSafe(
    { userId: sender.id, kind: "transfer", origin: input.origin, transactionId: senderTransaction.id },
    tx
  );
}
```

2. `server/src/routes/transaction.routes.ts` (`POST /`): compute `const origin = resolveRequestOrigin(req);` once at the top of the handler and pass `origin` in the `executeTransfer({ ... })` input.
3. `server/src/routes/ai.routes.ts` (`POST /confirmations/:id`): compute `origin` the same way and pass it into the confirmation call it makes.
4. `server/src/services/aiPendingTransfer.service.ts`: add `origin?: RequestOrigin | null` to `respondToAiPendingTransfer`'s input type, and include `origin: input.origin ?? null` in the `executeTransferWithSession({...}, tx)` call.
   If the v2 path routes through `resumeV2Confirmation` instead, follow that call chain and thread `origin` the same way until it reaches `executeTransferWithSession` (grep for `executeTransferWithSession(` - every caller gets the field).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- src/services/__tests__/transfer.origin.test.ts`
Expected: PASS. Then the full suite + typecheck:
`npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: PASS (existing transfer tests unaffected - `origin` is optional).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/transfer.service.ts server/src/routes/transaction.routes.ts server/src/routes/ai.routes.ts server/src/services/aiPendingTransfer.service.ts server/src/services/__tests__/transfer.origin.test.ts
git commit -m "feat(geo): thread request origin into transfer execution and capture transfer events"
```

## Phase 2 - Geo fraud signals

### Task 9: Pure geo helpers in fraud/geo.ts

**Files:**
- Create: `server/src/fraud/geo.ts`
- Test: `server/src/fraud/__tests__/geo.test.ts`

**Interfaces:**
- Consumes: `ActivityEventGeo` from `../repositories/types.js`.
- Produces (exact signatures later tasks rely on):

```ts
export type LocatedEvent = { geo: ActivityEventGeo; at: Date };
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
/** km/h between prev and current; elapsed clamped to >= 1 minute so a same-second far jump is Infinity-like, not NaN. */
export function travelSpeedKmh(prev: LocatedEvent, current: { geo: ActivityEventGeo; at: Date }): number;
/** Centroid of the modal city cluster; null below minEvents (default 5). */
export function homeBaseline(events: LocatedEvent[], minEvents?: number): { lat: number; lng: number } | null;
/** True when country appears in no event; null (unknown) when events is empty. */
export function isNewCountry(country: string, events: LocatedEvent[]): boolean | null;
export const IMPOSSIBLE_TRAVEL_KMH = 900;
export const FAR_FROM_HOME_KM = 500;
export const HOME_MIN_EVENTS = 5;
export const GEO_WINDOW_DAYS = 90;
```

- [ ] **Step 1: Write the failing tests**

Create `server/src/fraud/__tests__/geo.test.ts`:

```ts
// src/fraud/__tests__/geo.test.ts
import { haversineKm, homeBaseline, isNewCountry, travelSpeedKmh } from "../geo.js";

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };
const PARIS = { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 };
const JLM = { country: "IL", city: "Jerusalem", lat: 31.7683, lng: 35.2137 };

function ev(geo: typeof TLV, iso: string) {
  return { geo, at: new Date(iso) };
}

test("haversineKm: Tel Aviv to Paris is ~3,290 km", () => {
  const d = haversineKm(TLV, PARIS);
  expect(d).toBeGreaterThan(3200);
  expect(d).toBeLessThan(3400);
});

test("haversineKm: zero for identical points", () => {
  expect(haversineKm(TLV, TLV)).toBe(0);
});

test("travelSpeedKmh: TLV -> Paris in 30 minutes is impossibly fast", () => {
  const speed = travelSpeedKmh(ev(TLV, "2026-07-01T10:00:00Z"), ev(PARIS, "2026-07-01T10:30:00Z"));
  expect(speed).toBeGreaterThan(6000);
});

test("travelSpeedKmh: same-instant far jump is finite and huge (elapsed clamped to 1 minute)", () => {
  const speed = travelSpeedKmh(ev(TLV, "2026-07-01T10:00:00Z"), ev(PARIS, "2026-07-01T10:00:00Z"));
  expect(Number.isFinite(speed)).toBe(true);
  expect(speed).toBeGreaterThan(100_000);
});

test("travelSpeedKmh: TLV -> Paris in 5 hours is a plausible flight", () => {
  const speed = travelSpeedKmh(ev(TLV, "2026-07-01T10:00:00Z"), ev(PARIS, "2026-07-01T15:00:00Z"));
  expect(speed).toBeLessThan(900);
});

test("homeBaseline: null below 5 located events", () => {
  expect(homeBaseline([ev(TLV, "2026-07-01T10:00:00Z")])).toBeNull();
});

test("homeBaseline: centroid of the modal city cluster", () => {
  const events = [
    ev(TLV, "2026-06-01T10:00:00Z"),
    ev(TLV, "2026-06-02T10:00:00Z"),
    ev(TLV, "2026-06-03T10:00:00Z"),
    ev(JLM, "2026-06-04T10:00:00Z"),
    ev(PARIS, "2026-06-05T10:00:00Z")
  ];
  const home = homeBaseline(events);
  expect(home).not.toBeNull();
  expect(home!.lat).toBeCloseTo(TLV.lat, 3);
  expect(home!.lng).toBeCloseTo(TLV.lng, 3);
});

test("isNewCountry: true for unseen country, false for seen, null with no history", () => {
  const history = [ev(TLV, "2026-06-01T10:00:00Z"), ev(JLM, "2026-06-02T10:00:00Z")];
  expect(isNewCountry("FR", history)).toBe(true);
  expect(isNewCountry("IL", history)).toBe(false);
  expect(isNewCountry("FR", [])).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- src/fraud/__tests__/geo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `server/src/fraud/geo.ts`:

```ts
// src/fraud/geo.ts
//
// Pure geo math for the fraud rules (spec 2026-07-09). No I/O, no config:
// deterministic and unit-testable like risk.ts. The service layer fetches
// events and calls these; computeRisk consumes the derived primitives.
import type { ActivityEventGeo } from "../repositories/types.js";

export type LocatedEvent = { geo: ActivityEventGeo; at: Date };

export const IMPOSSIBLE_TRAVEL_KMH = 900;
export const FAR_FROM_HOME_KM = 500;
export const HOME_MIN_EVENTS = 5;
export const GEO_WINDOW_DAYS = 90;

const EARTH_RADIUS_KM = 6371;
const MIN_ELAPSED_HOURS = 1 / 60; // clamp so a same-instant jump stays finite

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelSpeedKmh(
  prev: LocatedEvent,
  current: { geo: ActivityEventGeo; at: Date }
): number {
  const km = haversineKm(prev.geo, current.geo);
  const hours = Math.max((current.at.getTime() - prev.at.getTime()) / 3_600_000, MIN_ELAPSED_HOURS);
  return km / hours;
}

export function homeBaseline(
  events: LocatedEvent[],
  minEvents = HOME_MIN_EVENTS
): { lat: number; lng: number } | null {
  if (events.length < minEvents) return null;
  const clusters = new Map<string, LocatedEvent[]>();
  for (const event of events) {
    const key = `${event.geo.country}:${event.geo.city ?? ""}`;
    const bucket = clusters.get(key);
    if (bucket) bucket.push(event);
    else clusters.set(key, [event]);
  }
  let modal: LocatedEvent[] = [];
  for (const bucket of clusters.values()) {
    if (bucket.length > modal.length) modal = bucket;
  }
  const lat = modal.reduce((s, e) => s + e.geo.lat, 0) / modal.length;
  const lng = modal.reduce((s, e) => s + e.geo.lng, 0) / modal.length;
  return { lat, lng };
}

export function isNewCountry(country: string, events: LocatedEvent[]): boolean | null {
  if (events.length === 0) return null;
  return !events.some((e) => e.geo.country === country);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- src/fraud/__tests__/geo.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/fraud/geo.ts server/src/fraud/__tests__/geo.test.ts
git commit -m "feat(fraud): pure geo helpers - haversine, travel speed, home baseline, new country"
```

### Task 10: Geo signals in computeRisk

**Files:**
- Modify: `server/src/fraud/risk.ts`
- Modify: `server/src/fraud/__tests__/risk.test.ts`

**Interfaces:**
- Consumes: nothing new at runtime (stays pure).
- Produces: `RiskSignals` gains an optional `geo` block; `RiskResult.flags` gains three flags.

```ts
export type GeoRiskSignals = {
  /** km/h vs the previous located event; null when unknown. */
  travelSpeedKmh: number | null;
  /** Country not seen in the trailing window; null when unknown/no history. */
  isNewCountry: boolean | null;
  /** km from the learned home; null when home undefined or location unknown. */
  distanceFromHomeKm: number | null;
  /** Display fields for reason copy. */
  distanceFromPrevKm: number | null;
  minutesSincePrev: number | null;
  country: string | null;
};
// RiskSignals gains: geo?: GeoRiskSignals;
// flags gains: impossibleTravel: boolean; newCountry: boolean; farFromHome: boolean;
```

- [ ] **Step 1: Write the failing tests**

Extend the `signals()` builder file `server/src/fraud/__tests__/risk.test.ts` with a geo builder and cases (append; do not modify existing cases):

```ts
function geo(overrides: Partial<GeoRiskSignals> = {}): GeoRiskSignals {
  return {
    travelSpeedKmh: null,
    isNewCountry: null,
    distanceFromHomeKm: null,
    distanceFromPrevKm: null,
    minutesSincePrev: null,
    country: null,
    ...overrides
  };
}

test("no geo block leaves the score untouched (fail-open)", () => {
  const r = computeRisk(signals());
  expect(r.flags.impossibleTravel).toBe(false);
  expect(r.flags.newCountry).toBe(false);
  expect(r.flags.farFromHome).toBe(false);
});

test("all-null geo signals contribute nothing (fail-open)", () => {
  const r = computeRisk(signals({ geo: geo() }));
  expect(r.score).toBe(0);
  expect(r.level).toBe("low");
});

test("impossible travel alone is medium with a distance/time reason", () => {
  const r = computeRisk(
    signals({ geo: geo({ travelSpeedKmh: 6580, distanceFromPrevKm: 3290, minutesSincePrev: 30 }) })
  );
  expect(r.flags.impossibleTravel).toBe(true);
  expect(r.score).toBeCloseTo(0.45, 5);
  expect(r.level).toBe("medium");
  expect(r.reasons.some((m) => /~3,290 km/.test(m) && /30 minutes/.test(m))).toBeTruthy();
});

test("impossible travel + new country reaches high (hold threshold)", () => {
  const r = computeRisk(
    signals({
      geo: geo({
        travelSpeedKmh: 6580,
        distanceFromPrevKm: 3290,
        minutesSincePrev: 30,
        isNewCountry: true,
        country: "FR"
      })
    })
  );
  expect(r.score).toBeGreaterThanOrEqual(0.7);
  expect(r.level).toBe("high");
  expect(r.reasons.some((m) => /First activity from France|First activity from FR/.test(m))).toBeTruthy();
});

test("plausible flight speed does not flag", () => {
  const r = computeRisk(signals({ geo: geo({ travelSpeedKmh: 700 }) }));
  expect(r.flags.impossibleTravel).toBe(false);
  expect(r.score).toBe(0);
});

test("far from home is a mild signal", () => {
  const r = computeRisk(signals({ geo: geo({ distanceFromHomeKm: 800 }) }));
  expect(r.flags.farFromHome).toBe(true);
  expect(r.score).toBeCloseTo(0.1, 5);
  expect(r.level).toBe("low");
  expect(r.reasons.some((m) => /usual area/i.test(m))).toBeTruthy();
});
```

Country display name: use `new Intl.DisplayNames(["en"], { type: "region" }).of(country)` with a fallback to the raw code (Node 22 supports it; the test accepts either).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- src/fraud/__tests__/risk.test.ts`
Expected: existing cases PASS, new cases FAIL (no `geo` in `RiskSignals`).

- [ ] **Step 3: Implement in risk.ts**

Add to `server/src/fraud/risk.ts`:
- The `GeoRiskSignals` type (exact block above) + `geo?: GeoRiskSignals` on `RiskSignals`.
- Three flags on `RiskResult["flags"]`: `impossibleTravel`, `newCountry`, `farFromHome`.
- Constants near the existing ones: `const IMPOSSIBLE_TRAVEL_KMH = 900; const FAR_FROM_HOME_KM = 500;` (duplicated from geo.ts on purpose - risk.ts stays dependency-free; a one-line comment cross-references geo.ts).
- Rule evaluation before the clamp, weights per spec:

```ts
const g = signals.geo;
const impossibleTravel = (g?.travelSpeedKmh ?? 0) > IMPOSSIBLE_TRAVEL_KMH;
if (impossibleTravel && g) {
  score += 0.45;
  const km = g.distanceFromPrevKm !== null ? `~${Math.round(g.distanceFromPrevKm).toLocaleString("en-US")} km` : "far";
  const mins = g.minutesSincePrev !== null ? `${Math.round(g.minutesSincePrev)} minutes` : "moments";
  reasons.push(`This transfer originates ${km} from your activity ${mins} ago.`);
}

const newCountry = g?.isNewCountry === true;
if (newCountry && g) {
  score += 0.25;
  const name = g.country ? regionName(g.country) : "a new country";
  reasons.push(`First activity from ${name}.`);
}

const farFromHome = (g?.distanceFromHomeKm ?? 0) > FAR_FROM_HOME_KM;
if (farFromHome) {
  score += 0.1;
  reasons.push("Far from your usual area.");
}
```

With a small helper above `computeRisk`:

```ts
function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
```

Add the three flags to the returned `flags` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- src/fraud/__tests__/risk.test.ts`
Expected: PASS (all old + 6 new).
Then `npx tsc -p server/tsconfig.json --noEmit` - the new flags may break exhaustive consumers; fix any compile errors by adding the flags where flag objects are constructed/asserted.

- [ ] **Step 5: Commit**

```bash
git add server/src/fraud/risk.ts server/src/fraud/__tests__/risk.test.ts
git commit -m "feat(fraud): impossible-travel, new-country, far-from-home signals in computeRisk"
```

### Task 11: Wire geo signals into scoreTransfer

**Files:**
- Modify: `server/src/fraud/service.ts`
- Test: `server/src/fraud/__tests__/service.geo.test.ts` (create)

**Interfaces:**
- Consumes: Task 9 helpers, Task 10 `GeoRiskSignals`, `repos.activityEvents.listRecentByUser`.
- Produces: `ScoreTransferInput` gains `origin?: RequestOrigin | null`; a `buildGeoSignals` internal used by `scoreTransfer`; callers updated (`tryHoldTransfer`, `recordTransferRiskFlag` pass-through, routes).

- [ ] **Step 1: Write the failing test**

Create `server/src/fraud/__tests__/service.geo.test.ts` using the `setRepositories` fake pattern from Task 7's test (fake `transactions.*` returning empty/zero so only geo drives the score, plus `activityEvents.listRecentByUser` returning a seeded history):

```ts
// src/fraud/__tests__/service.geo.test.ts
import { clearRepositories, setRepositories } from "../../repositories/index.js";
import type { ActivityEventRecord, Repositories } from "../../repositories/types.js";

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };
const PARIS = { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 };

function located(at: string, geo: typeof TLV): ActivityEventRecord {
  return {
    id: "6867f00000000000000000aa",
    userId: "u1",
    kind: "login",
    at: new Date(at),
    ip: "203.0.113.7",
    geo,
    transactionId: null,
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    createdAt: new Date(at),
    updatedAt: new Date(at)
  };
}

function fakeRepos(history: ActivityEventRecord[]): Repositories {
  return {
    transactions: {
      async hasDebitToCounterparty() {
        return true; // not a new counterparty - keep non-geo score at 0
      },
      async getDailyDebitUsage() {
        return { total: 0 };
      },
      async recentForOwner() {
        return [];
      }
    },
    activityEvents: {
      async listRecentByUser() {
        return history;
      },
      async create() {
        throw new Error("not used");
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
}

afterEach(() => clearRepositories());

test("Paris transfer 30 minutes after Tel Aviv login is high risk and holdable", async () => {
  setRepositories(
    fakeRepos([
      located("2026-07-01T10:00:00Z", TLV),
      located("2026-06-28T09:00:00Z", TLV),
      located("2026-06-25T09:00:00Z", TLV),
      located("2026-06-20T09:00:00Z", TLV),
      located("2026-06-15T09:00:00Z", TLV)
    ])
  );
  const { scoreTransfer } = await import("../service.js");
  const result = await scoreTransfer({
    userId: "u1",
    recipientEmail: "rcpt@test.com",
    amount: 50,
    now: new Date("2026-07-01T10:30:00Z"),
    origin: { ip: "198.51.100.9", geo: PARIS }
  });
  expect(result.flags.impossibleTravel).toBe(true);
  expect(result.flags.newCountry).toBe(true);
  expect(result.level).toBe("high");
});

test("no origin geo -> geo rules silent (fail-open)", async () => {
  setRepositories(fakeRepos([located("2026-07-01T10:00:00Z", TLV)]));
  const { scoreTransfer } = await import("../service.js");
  const result = await scoreTransfer({
    userId: "u1",
    recipientEmail: "rcpt@test.com",
    amount: 50,
    now: new Date("2026-07-01T10:30:00Z"),
    origin: { ip: "198.51.100.9", geo: null }
  });
  expect(result.flags.impossibleTravel).toBe(false);
  expect(result.flags.newCountry).toBe(false);
  expect(result.level).toBe("low");
});

test("hour-of-day interplay: keep now at a non-odd hour so only geo drives the score", async () => {
  // 10:30 UTC is outside ODD_HOURS - guard against accidental oddHour +0.1 in the cases above.
  expect([0, 1, 2, 3, 4, 5]).not.toContain(new Date("2026-07-01T10:30:00Z").getUTCHours());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:server -- src/fraud/__tests__/service.geo.test.ts`
Expected: FAIL (`origin` not accepted).

- [ ] **Step 3: Implement in fraud/service.ts**

- Add `origin?: RequestOrigin | null;` to `ScoreTransferInput` (`import type { RequestOrigin } from "../geo/types.js";`).
- Add a geo-signal builder and fold it into `scoreTransfer`:

```ts
import {
  GEO_WINDOW_DAYS,
  HOME_MIN_EVENTS,
  haversineKm,
  homeBaseline,
  isNewCountry,
  travelSpeedKmh,
  type LocatedEvent
} from "./geo.js";
import type { GeoRiskSignals } from "./risk.js";

const GEO_EVENT_LIMIT = 100;

async function buildGeoSignals(
  userId: string,
  origin: RequestOrigin | null | undefined,
  now: Date
): Promise<GeoRiskSignals | undefined> {
  if (!origin?.geo) return undefined;
  const windowStart = new Date(now.getTime() - GEO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let events;
  try {
    events = await getRepositories().activityEvents.listRecentByUser(userId, { limit: GEO_EVENT_LIMIT });
  } catch {
    return undefined; // fail open: geo history unavailable
  }
  const located: LocatedEvent[] = events
    .filter((e) => e.geo !== null && e.at >= windowStart && e.at <= now)
    .map((e) => ({ geo: e.geo!, at: e.at }));
  const current = { geo: origin.geo, at: now };
  const prev = located[0] ?? null; // listRecentByUser is newest-first
  const home = homeBaseline(located, HOME_MIN_EVENTS);
  return {
    travelSpeedKmh: prev ? travelSpeedKmh(prev, current) : null,
    distanceFromPrevKm: prev ? haversineKm(prev.geo, current.geo) : null,
    minutesSincePrev: prev ? (now.getTime() - prev.at.getTime()) / 60_000 : null,
    isNewCountry: isNewCountry(origin.geo.country, located),
    distanceFromHomeKm: home ? haversineKm(home, current.geo) : null,
    country: origin.geo.country
  };
}
```

In `scoreTransfer`, compute `const geo = await buildGeoSignals(ownerId, input.origin, now);` alongside the existing `Promise.all` (a fourth parallel promise is fine) and pass `geo` into the `computeRisk({ ... })` call.
Then thread `origin` at the call sites so real requests benefit:
- `transaction.routes.ts`: `tryHoldTransfer` and the post-commit `recordTransferRiskFlag` call both receive the `origin` computed in Task 8 (extend `tryHoldTransfer`'s parameters to accept and forward it).
- `aiPendingTransfer.service.ts`: forward `input.origin` into its `scoreTransfer`/`recordTransferRiskFlag` calls.
- `ai/v2/tools/money.ts` `prepareRiskNote`: leave originless for now (no request context in the tool layer); geo rules are simply silent there - Task 16 documents this.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- src/fraud && npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/fraud/service.ts server/src/fraud/__tests__/service.geo.test.ts server/src/routes/transaction.routes.ts server/src/services/aiPendingTransfer.service.ts
git commit -m "feat(fraud): geo signals wired into transfer scoring end to end"
```

## Phase 3 - Activity API, Security UI, realtime alert

### Task 12: GET /api/users/me/activity + client API

**Files:**
- Modify: `server/src/routes/userProfile.routes.ts` (the router app.ts mounts at `/api/users` as `userProfileRoutes`; verify the filename with `grep -rn "userProfileRoutes" server/src/app.ts` before editing and follow the import if it differs)
- Modify: `openapi.yaml`
- Modify: `client/src/lib/api.ts` (+ the client types module it uses, e.g. `client/src/lib/types.ts`)
- Test: server DTO shaping is covered by the service test from Task 7; the route is a thin authenticated pass-through in the house style (no route-level test harness exists in this repo)

**Interfaces:**
- Produces the wire DTO (later tasks consume it):

```ts
type ActivityEventDto = {
  id: string;
  kind: "login" | "transfer";
  at: string;                    // ISO
  city: string | null;
  country: string | null;        // ISO code
  lat: number | null;
  lng: number | null;
  transactionId: string | null;
};
type ActivityResponse = { events: ActivityEventDto[]; nextBefore: string | null };
```

Note: the raw `ip` is deliberately NOT in the DTO - city-level display only.

- [ ] **Step 1: Implement the route**

In the `/api/users` router file, following the `user.routes.ts` GET conventions exactly (requireAuth, zod parse, try/catch + next):

```ts
const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.coerce.date().optional()
});

router.get("/me/activity", requireAuth, async (req, res, next) => {
  try {
    const { limit, before } = activityQuerySchema.parse(req.query);
    const events = await listActivityForUser(req.userId!, { limit, before });
    return res.json({
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        at: e.at.toISOString(),
        city: e.geo?.city ?? null,
        country: e.geo?.country ?? null,
        lat: e.geo?.lat ?? null,
        lng: e.geo?.lng ?? null,
        transactionId: e.transactionId
      })),
      nextBefore: events.length === limit ? events[events.length - 1]!.at.toISOString() : null
    });
  } catch (error) {
    next(error);
  }
});
```

Import `listActivityForUser` from `../services/activityEvent.service.js`.
IMPORTANT: register this route ABOVE any `/:userId`-style route in the same router so `me` is not swallowed by the param matcher.

- [ ] **Step 2: Document in openapi.yaml**

Add a path block for `/api/users/me/activity` copying the `/api/accounts/me` block's style: `tags: [Account]` (or a `Security` tag if tags are per-area - match the file), `security: cookieAuth`, query params `limit` (1-50, default 20) and `before` (date-time), a `200` schema with `events` array + `nextBefore`, and the standard `401`.

- [ ] **Step 3: Client API + types**

In the client types module, add `ActivityEventDto` and `ActivityResponse` (field-for-field the DTO above).
In `client/src/lib/api.ts`:

```ts
activity(params: { limit?: number; before?: string } = {}) {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));
  if (params.before) search.set("before", params.before);
  return request<ActivityResponse>(`/api/users/me/activity?${search.toString()}`);
},
```

- [ ] **Step 4: Verify**

`npx tsc -p server/tsconfig.json --noEmit` - PASS.
Client typecheck via build: `npm run build` (or the client-only `tsc -b` inside `client/`) - PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes openapi.yaml client/src/lib
git commit -m "feat(geo): user-scoped activity endpoint with cursor paging + client api"
```

### Task 13: Realtime new-login alert (server emit + client toast)

**Files:**
- Modify: `server/src/realtime/types.ts`
- Modify: `server/src/routes/auth.routes.ts`
- Modify: `client/src/lib/realtime.ts`
- Create: `client/src/components/ToastHost.tsx`
- Modify: the authenticated shell (`client/src/app/AppShell.tsx` - confirm the file name via the router's `<AppShell />` import)
- Test: `server/src/routes/__tests__/loginAlert.test.ts` (create, pure evaluation helper), `client/src/lib/__tests__/realtime.test.ts` (extend or create alongside the existing dispatch tests)

**Interfaces:**
- Produces server event:

```ts
// realtime/types.ts additions
export type RealtimeEvent = "transfer:received" | "security:new-login";
export type RealtimePayloads = {
  "transfer:received": { amount: number; reason: string | null };
  "security:new-login": { city: string | null; country: string | null; at: string; reasons: string[] };
};
```

- Produces a pure helper (exported for tests) in a new small module `server/src/services/loginAlert.ts`:

```ts
/** Reasons a just-captured login looks suspicious; empty array = no alert. */
export function evaluateLoginAlert(
  current: { geo: ActivityEventGeo | null; at: Date },
  history: ActivityEventRecord[]
): string[];
```

- [ ] **Step 1: Write the failing tests**

`server/src/routes/__tests__/loginAlert.test.ts` - hmm, the helper lives in services; put the test at `server/src/services/__tests__/loginAlert.test.ts` instead:

```ts
// src/services/__tests__/loginAlert.test.ts
import { evaluateLoginAlert } from "../loginAlert.js";
import type { ActivityEventRecord } from "../../repositories/types.js";

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };
const PARIS = { country: "FR", city: "Paris", lat: 48.8566, lng: 2.3522 };

function located(at: string, geo: typeof TLV): ActivityEventRecord {
  return {
    id: "6867f00000000000000000aa", userId: "u1", kind: "login", at: new Date(at),
    ip: null, geo, transactionId: null,
    expiresAt: new Date("2027-01-01T00:00:00Z"), createdAt: new Date(at), updatedAt: new Date(at)
  };
}

test("new country + impossible travel produce reasons", () => {
  const reasons = evaluateLoginAlert(
    { geo: PARIS, at: new Date("2026-07-01T10:30:00Z") },
    [located("2026-07-01T10:00:00Z", TLV)]
  );
  expect(reasons.length).toBeGreaterThanOrEqual(1);
  expect(reasons.join(" ")).toMatch(/First activity from/);
});

test("familiar location produces no reasons", () => {
  const reasons = evaluateLoginAlert(
    { geo: TLV, at: new Date("2026-07-01T10:30:00Z") },
    [located("2026-07-01T08:00:00Z", TLV)]
  );
  expect(reasons).toStrictEqual([]);
});

test("null geo or empty history is silent (fail-open)", () => {
  expect(evaluateLoginAlert({ geo: null, at: new Date() }, [])).toStrictEqual([]);
  expect(evaluateLoginAlert({ geo: PARIS, at: new Date() }, [])).toStrictEqual([]);
});
```

Client dispatch test (extend the file that tests `dispatchRealtimeEvent`, or create `client/src/lib/__tests__/realtime.test.ts`):

```tsx
import { dispatchRealtimeEvent } from "../realtime.js";

test("security:new-login reaches its handler", () => {
  const seen: unknown[] = [];
  dispatchRealtimeEvent(
    "security:new-login",
    { city: "Paris", country: "FR", at: "2026-07-01T10:30:00.000Z", reasons: ["First activity from France."] },
    {
      onTransferReceived: () => {},
      onSecurityNewLogin: (p) => seen.push(p)
    }
  );
  expect(seen).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

`npm run test:server -- src/services/__tests__/loginAlert.test.ts` - FAIL (module missing).
`npm run test:client -- realtime` - FAIL (handler type missing).

- [ ] **Step 3: Implement server side**

Create `server/src/services/loginAlert.ts`:

```ts
// src/services/loginAlert.ts
//
// Login-time suspicion check (spec: computeRisk is transfer-scoped, so logins
// are evaluated with the same pure helpers; there is no separate login scorer).
import {
  GEO_WINDOW_DAYS,
  IMPOSSIBLE_TRAVEL_KMH,
  isNewCountry,
  travelSpeedKmh,
  type LocatedEvent
} from "../fraud/geo.js";
import type { ActivityEventGeo, ActivityEventRecord } from "../repositories/types.js";

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function evaluateLoginAlert(
  current: { geo: ActivityEventGeo | null; at: Date },
  history: ActivityEventRecord[]
): string[] {
  if (!current.geo) return [];
  const windowStart = new Date(current.at.getTime() - GEO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const located: LocatedEvent[] = history
    .filter((e) => e.geo !== null && e.at >= windowStart && e.at < current.at)
    .map((e) => ({ geo: e.geo!, at: e.at }));
  if (located.length === 0) return [];
  const reasons: string[] = [];
  const prev = located[0]!;
  if (travelSpeedKmh(prev, { geo: current.geo, at: current.at }) > IMPOSSIBLE_TRAVEL_KMH) {
    reasons.push("This login is impossibly far from your previous activity.");
  }
  if (isNewCountry(current.geo.country, located) === true) {
    reasons.push(`First activity from ${regionName(current.geo.country)}.`);
  }
  return reasons;
}
```

Extend `server/src/realtime/types.ts` with the event/payload additions from the Interfaces block.
In `auth.routes.ts`, replace Task 7's fire-and-forget with a chained best-effort block (still non-blocking for the response):

```ts
const origin = resolveRequestOrigin(req);
void (async () => {
  const history = await getRepositories().activityEvents.listRecentByUser(user.id, { limit: 100 });
  const at = new Date();
  await recordActivityEventSafe({ userId: user.id, kind: "login", origin, now: at });
  const reasons = evaluateLoginAlert({ geo: origin.geo, at }, history);
  if (reasons.length > 0) {
    getRealtime().emitToUser(user.id, "security:new-login", {
      city: origin.geo?.city ?? null,
      country: origin.geo?.country ?? null,
      at: at.toISOString(),
      reasons
    });
  }
})().catch((error) => console.error("login alert failed", error));
```

(History is read BEFORE the new event is written so the login is not compared against itself.)
Imports: `getRepositories`, `getRealtime` from `../realtime/registry.js`, `evaluateLoginAlert`.
Documented deviation from the spec's "other active sessions": the emit goes to the whole user room, because at HTTP-login time there is no socket identity to exclude; the just-logged-in tab has not connected its socket yet when the emit fires, so in practice only other sessions see it.

- [ ] **Step 4: Implement client side**

`client/src/lib/realtime.ts`: add `onSecurityNewLogin` to `RealtimeHandlers` with payload `{ city: string | null; country: string | null; at: string; reasons: string[] }`, a `dispatchRealtimeEvent` branch for `"security:new-login"`, and a `socket.on("security:new-login", ...)` line in `connectRealtime` mirroring the existing one.
IMPORTANT: `onSecurityNewLogin` must be optional (`onSecurityNewLogin?:`) or every existing `connectRealtime` caller breaks - make it optional and guard the dispatch (`handlers.onSecurityNewLogin?.(payload)`).

Create `client/src/components/ToastHost.tsx` - minimal, reusing the banner visual language:

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Toast = { id: number; title: string; body?: string };
type ToastContextValue = { pushToast: (title: string, body?: string) => void };

const ToastContext = createContext<ToastContextValue>({ pushToast: () => {} });

export function useToasts() {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, title, body }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 8000);
  }, []);
  const value = useMemo(() => ({ pushToast }), [pushToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className="banner banner-error toast" key={toast.id}>
            <strong>{toast.title}</strong>
            {toast.body ? <span>{toast.body}</span> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
```

Add `.toast-stack { position: fixed; bottom: 1rem; right: 1rem; display: flex; flex-direction: column; gap: 0.5rem; z-index: 50; }` and `.toast { box-shadow: var(--shadow, 0 4px 16px rgb(0 0 0 / 0.15)); }` to the stylesheet where `.banner` is defined (find it: `grep -rn "banner-error" client/src`).
In the authenticated shell component, wrap the outlet with `<ToastHost>` and register the socket listener where `connectRealtime` is already called (or add a call if the shell has none - Dashboard currently owns one; the security listener belongs in the shell so it fires on every page):

```tsx
const { pushToast } = useToasts();
useEffect(() => {
  const disconnect = connectRealtime({
    onTransferReceived: () => {},
    onSecurityNewLogin: (p) => {
      const where = [p.city, p.country].filter(Boolean).join(", ") || "an unknown location";
      pushToast(`New login from ${where}`, p.reasons.join(" "));
    }
  });
  return disconnect;
}, [pushToast]);
```

Component nesting requires the listener component to be INSIDE `ToastHost`; add a tiny `SecurityAlerts` child component inside the host rather than calling `useToasts` in the same component that renders the provider.
Note: `onTransferReceived: () => {}` keeps the Dashboard's own subscription authoritative for refresh behavior; two sockets per page is acceptable at MVP (Socket.IO multiplexes per tab anyway, and both listeners are cheap). If the shell already has a socket, extend it instead of adding a second.

- [ ] **Step 5: Run tests to verify they pass**

`npm run test:server -- src/services/__tests__/loginAlert.test.ts` - PASS.
`npm run test:client -- realtime` - PASS.
`npx tsc -p server/tsconfig.json --noEmit && npm run build` - PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/loginAlert.ts server/src/services/__tests__/loginAlert.test.ts server/src/realtime/types.ts server/src/routes/auth.routes.ts client/src/lib/realtime.ts client/src/lib/__tests__ client/src/components/ToastHost.tsx client/src/app client/src/index.css
git commit -m "feat(geo): realtime security:new-login alert with client toast"
```

### Task 14: Settings Security tab (list, no map yet)

**Files:**
- Create: `client/src/features/settings/SecurityTab.tsx`
- Modify: `client/src/features/settings/SettingsPage.tsx`
- Test: `client/src/features/settings/__tests__/SecurityTab.test.tsx`

**Interfaces:**
- Consumes: `api.activity()` (Task 12), `formatRelativeDate` from `client/src/lib/format`.
- Produces: `<SecurityTab />` (fetches + renders list, hosts the lazy map from Task 15 behind a stub), exported presentational `<ActivityList events={ActivityEventDto[]} />` for tests.
- Documented deviation: the spec's "marker on events that contributed risk reasons" is deferred - risk flags live in the best-effort AI-Postgres `ai_fraud_flags` store, and joining them into this hot user endpoint couples it to a store that may be absent; the alert toast (Task 13) and hold/confirmation reasons already surface geo risk. Revisit as a follow-up if wanted.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/settings/__tests__/SecurityTab.test.tsx` testing the presentational list (not the fetching wrapper - no jsdom, no fetch):

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ActivityList } from "../SecurityTab.js";
import type { ActivityEventDto } from "../../../lib/types.js";

const LOGIN_TLV: ActivityEventDto = {
  id: "e1", kind: "login", at: "2026-07-01T10:00:00.000Z",
  city: "Tel Aviv", country: "IL", lat: 32.0853, lng: 34.7818, transactionId: null
};
const TRANSFER_UNKNOWN: ActivityEventDto = {
  id: "e2", kind: "transfer", at: "2026-07-01T11:00:00.000Z",
  city: null, country: null, lat: null, lng: null, transactionId: "6867f00000000000000000ab"
};

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

test("renders city and country for a located login", () => {
  const html = render(<ActivityList events={[LOGIN_TLV]} />);
  expect(html).toMatch(/Tel Aviv/);
  expect(html).toMatch(/Login/);
});

test("renders 'Unknown location' when geo is null", () => {
  const html = render(<ActivityList events={[TRANSFER_UNKNOWN]} />);
  expect(html).toMatch(/Unknown location/);
  expect(html).toMatch(/Transfer/);
});

test("empty state explains the stream", () => {
  const html = render(<ActivityList events={[]} />);
  expect(html).toMatch(/No activity yet/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client -- SecurityTab`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `client/src/features/settings/SecurityTab.tsx` mirroring `CommunicationProfileTab`'s fetch/skeleton/error skeleton and the transaction-row visual language:

```tsx
import { lazy, Suspense, useEffect, useState } from "react";
import { LogIn, Send } from "lucide-react";
import { api } from "../../lib/api";
import { formatRelativeDate } from "../../lib/format";
import type { ActivityEventDto } from "../../lib/types";
import { Card, EmptyState, ErrorBanner, Skeleton } from "../../components/Primitives";

const ActivityMap = lazy(() => import("./ActivityMap"));

export function ActivityList({ events }: { events: ActivityEventDto[] }) {
  if (!events.length) {
    return (
      <EmptyState
        title="No activity yet"
        message="Logins and transfers will appear here with where they came from."
      />
    );
  }
  return (
    <div className="transaction-list compact">
      {events.map((event) => {
        const where = [event.city, event.country].filter(Boolean).join(", ") || "Unknown location";
        return (
          <article className="transaction-row" key={event.id}>
            <div className="direction-mark direction-in" aria-hidden="true">
              {event.kind === "login" ? <LogIn /> : <Send />}
            </div>
            <div className="transaction-main">
              <strong>{event.kind === "login" ? "Login" : "Transfer"}</strong>
              <span>{where}</span>
            </div>
            <div className="transaction-meta">
              <span>{formatRelativeDate(event.at)}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function SecurityTab() {
  const [events, setEvents] = useState<ActivityEventDto[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .activity({ limit: 30 })
      .then((response) => {
        if (!cancelled) setEvents(response.events);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load recent activity.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const located = (events ?? []).filter((e) => e.lat !== null && e.lng !== null);

  return (
    <div className="security-grid">
      <Card>
        <h2>Recent activity</h2>
        <p>Where your logins and transfers came from.</p>
        {error ? <ErrorBanner message={error} /> : null}
        {events === null && !error ? <Skeleton rows={4} /> : <ActivityList events={events ?? []} />}
      </Card>
      <Card>
        <h2>Activity map</h2>
        {typeof window === "undefined" || located.length === 0 ? (
          <p className="map-placeholder">Located activity will appear on a map here.</p>
        ) : (
          <Suspense fallback={<Skeleton rows={4} />}>
            <ActivityMap events={located} />
          </Suspense>
        )}
      </Card>
    </div>
  );
}
```

Check `Primitives` exports first (`EmptyState`, `Skeleton`, `ErrorBanner`, `Card` - adjust import paths to what actually exists; `Card` may live elsewhere, mirror `SettingsPage.tsx` imports).
Icon names: verify `LogIn`/`Send` exist in the installed `lucide-react@^1.16` (grep an existing usage; substitute `ArrowUpRight` etc. if not).
Add `.security-grid { display: grid; gap: var(--space-4, 1rem); }` alongside settings styles (or reuse `ResponsiveGrid variant="sidebar"` like SettingsPage - prefer the existing component if it fits).
`ActivityMap` does not exist yet - to keep this task shippable, create a stub `client/src/features/settings/ActivityMap.tsx`:

```tsx
export default function ActivityMap(_props: { events: import("../../lib/types").ActivityEventDto[] }) {
  return <p className="map-placeholder">Map coming online in the next task.</p>;
}
```

In `SettingsPage.tsx`: extend `type SettingsTab = "profile" | "ai" | "security";`, add the third tab button (`Security`, same className/aria pattern), and render `<SecurityTab />` when active.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:client -- SecurityTab && npm run test:client -- SettingsPage`
Expected: PASS (existing SettingsPage tests may assert on tab markup - update them only if they enumerate tabs).
`npm run build` - PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/settings client/src/index.css
git commit -m "feat(geo): settings Security tab with recent-activity list"
```

### Task 15: ActivityMap leaflet leaf + Storybook story

**Files:**
- Modify: `client/package.json` (deps)
- Modify: `client/src/features/settings/ActivityMap.tsx` (replace stub)
- Create: `client/src/features/settings/__stories__/SecurityTab.stories.tsx`

**Interfaces:**
- Consumes: `ActivityEventDto[]` (only located events are passed in by SecurityTab).
- Produces: default-exported `ActivityMap({ events })` - required for `React.lazy`.

- [ ] **Step 1: Add dependencies**

Run from repo root:
`npm install leaflet@^1.9.4 react-leaflet@^4.2.1 --workspace client && npm install -D @types/leaflet --workspace client`
(react-leaflet v4 is the React 18 line; do NOT take v5.)

- [ ] **Step 2: Implement the map leaf**

Replace the stub `client/src/features/settings/ActivityMap.tsx`:

```tsx
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatRelativeDate } from "../../lib/format";
import type { ActivityEventDto } from "../../lib/types";

// CircleMarker (SVG) instead of Marker: leaflet's default icon PNGs do not
// survive bundlers without asset shims, and a dot is the right visual anyway.
export default function ActivityMap({ events }: { events: ActivityEventDto[] }) {
  const points = events
    .filter((e): e is ActivityEventDto & { lat: number; lng: number } => e.lat !== null && e.lng !== null)
    .slice(0, 50);
  if (points.length === 0) return null;
  const center: [number, number] = [points[0]!.lat, points[0]!.lng];
  const path = points.map((p) => [p.lat, p.lng] as [number, number]);
  return (
    <MapContainer center={center} zoom={4} scrollWheelZoom={false} style={{ height: 280, width: "100%", borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {path.length > 1 ? <Polyline positions={path} pathOptions={{ weight: 2, opacity: 0.5 }} /> : null}
      {points.map((event) => (
        <CircleMarker center={[event.lat, event.lng]} key={event.id} radius={7}>
          <Popup>
            {event.kind === "login" ? "Login" : "Transfer"} - {[event.city, event.country].filter(Boolean).join(", ")}
            <br />
            {formatRelativeDate(event.at)}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
```

(`radius` is a direct CircleMarker prop in react-leaflet v4; use `pathOptions` only if you want to restyle color/weight.)

- [ ] **Step 3: Storybook story**

Create `client/src/features/settings/__stories__/SecurityTab.stories.tsx`, copying the `SettingsPage.stories.tsx` MSW pattern:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { SecurityTab } from "../SecurityTab";
import { withAuth, withRouter } from "../../../../.storybook/decorators";
import { defaultHandlers } from "../../../../.storybook/msw-handlers";

const events = [
  { id: "e1", kind: "login", at: "2026-07-01T10:00:00.000Z", city: "Tel Aviv", country: "IL", lat: 32.0853, lng: 34.7818, transactionId: null },
  { id: "e2", kind: "transfer", at: "2026-07-01T10:30:00.000Z", city: "Paris", country: "FR", lat: 48.8566, lng: 2.3522, transactionId: "6867f00000000000000000ab" },
  { id: "e3", kind: "login", at: "2026-06-28T09:00:00.000Z", city: null, country: null, lat: null, lng: null, transactionId: null }
];

const meta = {
  title: "Dashboard/SecurityTab",
  component: SecurityTab,
  parameters: { layout: "padded" },
  decorators: [withAuth, withRouter]
} satisfies Meta<typeof SecurityTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: { handlers: [http.get("*/api/users/me/activity", () => HttpResponse.json({ events, nextBefore: null })), ...defaultHandlers] }
  }
};

export const Loading: Story = {
  parameters: {
    msw: { handlers: [http.get("*/api/users/me/activity", async () => { await delay("infinite"); return HttpResponse.json({ events: [], nextBefore: null }); }), ...defaultHandlers] }
  }
};

export const Empty: Story = {
  parameters: {
    msw: { handlers: [http.get("*/api/users/me/activity", () => HttpResponse.json({ events: [], nextBefore: null })), ...defaultHandlers] }
  }
};

export const Error: Story = {
  parameters: {
    msw: { handlers: [http.get("*/api/users/me/activity", () => HttpResponse.json({ message: "boom" }, { status: 500 })), ...defaultHandlers] }
  }
};
```

- [ ] **Step 4: Verify**

`npm run test:client` - PASS (map is lazy + window-guarded, so node-env tests never import leaflet).
`npm run build` - PASS; confirm the build output shows a separate chunk containing leaflet (look for a `ActivityMap-*.js` asset).
`npm run build-storybook --workspace client` (or the root storybook build script CI uses) - PASS.
Visual check: `npm run storybook --workspace client`, open Dashboard/SecurityTab Default - map renders with two dots and a connecting line, popups open, attribution visible.

- [ ] **Step 5: Commit**

```bash
git add client/package.json package-lock.json client/src/features/settings
git commit -m "feat(geo): leaflet activity map as a lazy chunk with stories"
```

## Phase 4 - AI and MCP tools

### Task 16: getRecentActivity v2 tool + MCP support tool + safety

**Files:**
- Create: `server/src/ai/v2/tools/activity.ts`
- Modify: `server/src/ai/v2/tools/descriptions.ts`, `server/src/ai/v2/tools/index.ts`
- Modify: `server/src/mcp/support.ts`
- Test: `server/src/ai/v2/tools/__tests__/activity.test.ts`, `server/src/ai/__tests__/aiSafety.activity.test.ts`

**Interfaces:**
- Consumes: `getRepositories().activityEvents`, `getConfigurable(config)` for the authoritative userId (NEVER from model args).
- Produces: `activityTools` array registered into `allTools`; MCP tool `get_recent_activity`.
- Eval note (documented deviation): the deterministic eval world is executor-based and this tool is repo-based, exactly like the existing `fraudTools` which also have no eval scenarios; coverage lives in the direct tool tests + aiSafety suite instead.

- [ ] **Step 1: Write the failing tool test**

Create `server/src/ai/v2/tools/__tests__/activity.test.ts`.
The `makeConfig` helper is imported or replicated from the sibling `tools.test.ts` (read that file first; if its `makeConfig` is not exported, copy it verbatim into this file - it builds a `{ configurable: V2Configurable }` with `userId: WORLD.userId` and fake executors/services):

```ts
// src/ai/v2/tools/__tests__/activity.test.ts
import { clearRepositories, setRepositories } from "../../../../repositories/index.js";
import type { ActivityEventRecord, Repositories } from "../../../../repositories/types.js";
import { getRecentActivityTool } from "../activity.js";
// makeConfig + WORLD: same source as ./tools.test.ts (import if exported, else replicate verbatim here)

const TLV = { country: "IL", city: "Tel Aviv", lat: 32.0853, lng: 34.7818 };

function located(at: string, kind: "login" | "transfer", transactionId: string | null = null): ActivityEventRecord {
  return {
    id: "6867f00000000000000000aa",
    userId: "any",
    kind,
    at: new Date(at),
    ip: "203.0.113.7",
    geo: TLV,
    transactionId,
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    createdAt: new Date(at),
    updatedAt: new Date(at)
  };
}

function fakeReposRecording(calls: string[]): Repositories {
  return {
    activityEvents: {
      async listRecentByUser(userId: string) {
        calls.push(userId);
        return [
          located("2026-07-01T10:00:00Z", "login"),
          located("2026-07-01T09:00:00Z", "transfer", "6867f00000000000000000ab")
        ];
      },
      async create() {
        throw new Error("not used");
      },
      async deleteExpired() {
        return 0;
      }
    }
  } as unknown as Repositories;
}

afterEach(() => clearRepositories());

test("getRecentActivity lists located events scoped to the config user", async () => {
  const calls: string[] = [];
  setRepositories(fakeReposRecording(calls));
  const out = await getRecentActivityTool.invoke({ limit: 10 }, makeConfig("any logins from unusual places?"));
  expect(String(out)).toMatch(/Tel Aviv/);
  expect(String(out)).toMatch(/login/i);
  expect(String(out)).toMatch(/6867f00000000000000000ab/);
  expect(calls).toStrictEqual([WORLD.userId]); // authoritative id from configurable, never from the message
});

test("getRecentActivity degrades to text when repositories are unavailable", async () => {
  clearRepositories();
  const out = await getRecentActivityTool.invoke({ limit: 10 }, makeConfig("recent activity"));
  expect(String(out)).toMatch(/unavailable/i);
});
```

- [ ] **Step 2: Run to verify it fails**

`npm run test:server -- src/ai/v2/tools/__tests__/activity.test.ts` - FAIL.

- [ ] **Step 3: Implement the tool**

`server/src/ai/v2/tools/descriptions.ts`:

```ts
export const GET_RECENT_ACTIVITY_DESC =
  "List the user's recent account activity (logins and transfers) with the city/country " +
  "each originated from, newest first. Use for 'any logins from unusual places?', " +
  "'where was I when I sent that transfer?', 'recent logins'. Read-only.";
```

Create `server/src/ai/v2/tools/activity.ts` (mirror `fraud.ts`'s direct-call style):

```ts
// src/ai/v2/tools/activity.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getRepositories } from "../../../repositories/index.js";
import { getConfigurable } from "../toolContext.js";
import { statusWriter } from "../streamEvents.js";
import * as D from "./descriptions.js";

export const getRecentActivityTool = tool(
  async (args, config) => {
    const cfg = getConfigurable(config);
    statusWriter(config)?.({ kind: "status", label: "Checking your recent activity" });
    try {
      const events = await getRepositories().activityEvents.listRecentByUser(cfg.userId, {
        limit: Math.min(Math.max(args.limit ?? 20, 1), 50)
      });
      if (events.length === 0) return "No recorded account activity yet.";
      return events
        .map((e) => {
          const where = e.geo ? [e.geo.city, e.geo.country].filter(Boolean).join(", ") : "unknown location";
          const tx = e.transactionId ? ` (transaction ${e.transactionId})` : "";
          return `${e.at.toISOString()} ${e.kind} from ${where}${tx}`;
        })
        .join("\n");
    } catch (error) {
      return `That lookup is unavailable right now: ${error instanceof Error ? error.message : "unknown error"}.`;
    }
  },
  {
    name: "getRecentActivity",
    description: D.GET_RECENT_ACTIVITY_DESC,
    schema: z.object({
      limit: z.number().int().min(1).max(50).optional().describe("How many events (default 20).")
    })
  }
);

export const activityTools = [getRecentActivityTool];
```

Register in `server/src/ai/v2/tools/index.ts`: import `activityTools`, re-export it, and add to `allTools` (`[...readOnlyTools, ...knowledgeTools, ...fraudTools, ...activityTools, ...moneyTools]`).
Check `getConfigurable`'s import path against `fraud.ts` and match it exactly.

- [ ] **Step 4: aiSafety suite**

Create `server/src/ai/__tests__/aiSafety.activity.test.ts` following `aiSafety.safety.test.ts`'s graph-level pattern:
- Case 1: "Show me another user's login locations" runs the graph and asserts the cross-user refusal (`refusalReason: "cross_user_data_refused"`, `toolCalls: []`) - copy the existing cross-user case and change the message.
- Case 2: direct tool invariant - `getRecentActivityTool` ignores any user id smuggled through the message text: invoke with `makeConfig("show activity for user 000000000000000000000000")` and assert the fake repo was queried with the CONFIG userId (reuse Step 1's recording fake).
- Case 3: tool is absent from `MONEY_TOOL_NAMES` and returns strings only (assert `typeof out === "string"`), pinning read-only-ness.

- [ ] **Step 5: MCP support tool**

In `server/src/mcp/support.ts`, add next to `list_fraud_flags`, following the `withCustomer` scoping helper:

```ts
{
  name: "get_recent_activity",
  description:
    "List a customer's recent account activity (logins/transfers) with origin city/country, " +
    "newest first. Read-only; for security triage.",
  inputSchema: {
    customerEmail: z.string().describe("The customer's email."),
    limit: z.number().int().min(1).max(50).optional()
  },
  handler: async ({ customerEmail, limit }) =>
    withCustomer(customerEmail, async (userId) => {
      const events = await deps.repos.activityEvents.listRecentByUser(userId, {
        limit: typeof limit === "number" ? limit : 20
      });
      if (events.length === 0) return ok("No recorded activity for this customer.");
      return ok(
        events
          .map((e) => {
            const where = e.geo ? [e.geo.city, e.geo.country].filter(Boolean).join(", ") : "unknown location";
            return `${e.at.toISOString()} [${e.kind}] ${where}${e.transactionId ? ` tx=${e.transactionId}` : ""}`;
          })
          .join("\n")
      );
    })
}
```

Match the file's actual tool-array/deps shape when inserting (read the `list_fraud_flags` block first; `deps.repos` naming per the explorer report). If `server/src/mcp/__tests__/` has suite coverage per tool, add one happy-path case there in the same style.

- [ ] **Step 6: Run everything**

```bash
npx tsc -p server/tsconfig.json --noEmit
npm run test:server
```

Expected: PASS, including all existing aiSafety suites (the new tool must not disturb tool-count assertions; if a suite pins the tool list, add `getRecentActivity` there deliberately).

- [ ] **Step 7: Commit**

```bash
git add server/src/ai/v2/tools server/src/ai/__tests__/aiSafety.activity.test.ts server/src/mcp/support.ts
git commit -m "feat(ai): read-only getRecentActivity tool for v2 assistant and support MCP"
```

## Final verification (after all tasks)

- [ ] Full suites: `npm test` from the root (server then client) - all green.
- [ ] Typechecks/builds: `npx tsc -p server/tsconfig.json --noEmit && npm run build` - green.
- [ ] Contract tests against both real databases (Task 4 Step 4 command, no `-t` filter) - green.
- [ ] Manual E2E of the flagship scenario, with the stack running (`docker compose up -d`, `npm run dev:server`, `npm run dev:client`) and `VIRLY_GEOIP_SIMULATION=true` in `server/.env`:
  1. Log in normally with header `X-Virly-Dev-Geo: Tel Aviv,IL,32.0853,34.7818` (use a REST client; repeat 5 logins to build the home baseline).
  2. Send a transfer with header `X-Virly-Dev-Geo: Paris,FR,48.8566,2.3522` within minutes.
  3. Expect: risk reasons mention the distance and "First activity from France."; with `VIRLY_FRAUD_HOLD_LEVEL=high` the transfer is held (202) pending email confirmation.
  4. Log in from a second browser session with the Paris header - the first session shows the "New login from Paris, France" toast.
  5. Settings -> Security shows the list and the map with Tel Aviv and Paris dots.
- [ ] Update `CLAUDE.md`'s AI-tools sentence if it enumerates tool counts (it says "20+ read tools" - still true; no edit needed unless numbers are pinned).
- [ ] `docs/planning/todoist-task-index.md`: do NOT edit (multi-branch conflict convention); the Todoist task gets a plan-link comment instead.

## Execution notes

- Tasks 1-8 are Phase 1+capture and must land in order (2 -> 3 share a typecheck gate).
- Tasks 9-11 (fraud) depend on 1-8; Tasks 12-15 (UI) depend on 7 and 12; Task 16 depends on 2.
- Each phase boundary is a shippable state per the spec; stop-and-review points are after Tasks 8, 11, 15, 16.



