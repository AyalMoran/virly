# Saved Contacts + Recent Recipients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Todoist task:** `6gfGpV4GVwGxhjPM` - "להוסיף אנשי קשר ו-recent" (add contacts and recent).

**Goal:** Give users a persistent, explicit contact book (save / list / remove) alongside the existing transaction-derived "Recent payees", surfaced on the transfer page as one recipient book.

**Architecture:** "Recent" already exists: `getQuickContacts` (`client/src/lib/contacts.ts`) derives up to 5 recent counterparties from the account summary's first 10 transactions and renders chips on the transfer page and dashboard.
What is missing is persistence: a saved contact survives beyond the last 10 transactions and can carry a display name.
This plan adds a `contacts` repository through the repository seam (interface in `types.ts`, Mongoose + Drizzle implementations, contract tests for both drivers), a thin service + routes (`GET/POST /api/contacts`, `DELETE /api/contacts/:id`), and a client recipient book on the transfer page that merges saved contacts with recents (save-from-recent, remove-saved).

**Tech Stack:** Repository seam (ADR: never reach past `getRepositories()`), Mongoose model + Drizzle `pgTable` + generated migration, Zod-validated Express routes, contract tests via `describeContract`, client React + Jest static-markup tests.

## Global Constraints

- All data access goes through the repository interface; services and routes call `getRepositories()`, never Mongoose/Drizzle directly.
- IDs are 24-hex ObjectId strings in both drivers (ADR 0002); Postgres ids come from `newObjectId()` (`repositories/postgres/id.ts`).
- Server imports carry `.js` specifiers (NodeNext ESM).
- Emails are normalized to lowercase at the seam boundary; unique per `(ownerId, email)`.
- Contract tests must pass against BOTH drivers: `docker compose -f docker-compose.test.yml up -d`, then run with `CONTRACT_PG_URL=postgres://virly:virly@localhost:5433/virly` and `CONTRACT_MONGO_URL="mongodb://localhost:27018/virly_contract?directConnection=true"`.
- Unsafe HTTP methods require the CSRF header; the client `api.ts` request helper already attaches it.
- Client tests: static markup, no jsdom; hook-free presentational pieces are unit-tested, page wiring is covered by typecheck + existing page tests.
- Never use emojis.

## Approach & rationale

Saved contacts vs recents are deliberately different things:

- **Recent** stays derived (no persistence, self-maintaining) - it already works and costs nothing.
- **Saved** is an explicit user action with a server-side record, because "recent" forgets anyone who drops out of the last 10 transactions.

Contact emails must belong to registered users (same rule as transfers, which reject unknown recipients), validated at save time via `repos.users.findByEmail`.
Deleting is by contact id scoped to the owner, so one user can never delete another's contact.
`upsertForOwner` (not `create`) makes saving idempotent: double-clicking "save" or re-saving after a race returns the existing row instead of erroring.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/repositories/types.ts` (modify) | `ContactRecord`, `ContactRepository`, add `contacts` to `Repositories`. |
| `server/src/models/Contact.ts` (create) | Mongoose schema (ownerId + email unique). |
| `server/src/repositories/mongo/contact.repository.ts` (create) | Mongo implementation. |
| `server/src/repositories/postgres/schema.ts` (modify) | `contacts` table. |
| `server/src/repositories/postgres/contact.repository.ts` (create) | Postgres implementation. |
| `server/src/repositories/mongo/index.ts`, `postgres/index.ts` (modify) | Wire `contacts` into both factories. |
| `server/tests/contract/contact.contract.test.ts` (create) | Dual-driver contract cases. |
| `server/tests/contract/harness.ts` (modify) | Add `"contacts"` to `PG_TABLES`. |
| `server/src/services/contacts.service.ts` (create) | add / list / remove with ownership + registered-user checks. |
| `server/src/services/__tests__/contacts.service.test.ts` (create) | Service unit tests (stubbed repositories). |
| `server/src/routes/contacts.routes.ts` (create) | Zod-validated HTTP endpoints. |
| `server/src/app.ts` (modify) | Mount `/api/contacts`. |
| `openapi.yaml` (modify) | Contacts endpoints + schema. |
| `client/src/lib/types.ts` (modify) | `Contact`, `ContactsResponse`. |
| `client/src/lib/api.ts` (modify) | `contacts()`, `addContact()`, `deleteContact()`. |
| `client/src/lib/contacts.ts` (modify) | `mergeRecipientBook(saved, recent)` pure helper. |
| `client/src/lib/__tests__/contacts.test.ts` (modify) | Tests for the merge helper. |
| `client/src/features/transfer/RecipientBook.tsx` (create) | Hook-free saved+recent chip book with save/remove affordances. |
| `client/src/features/transfer/__tests__/RecipientBook.test.tsx` (create) | Component tests. |
| `client/src/features/transfer/__stories__/RecipientBook.stories.tsx` (create) | Story. |
| `client/src/features/transfer/TransferPage.tsx` (modify) | Fetch contacts, replace the inline "Recent payees" block with `RecipientBook`. |
| `client/src/styles/global.css` (modify) | Chip action styles. |

---

## Task 1: Repository seam - interface, both drivers, contract tests (TDD)

**Files:**
- Modify: `server/src/repositories/types.ts`
- Create: `server/src/models/Contact.ts`
- Create: `server/src/repositories/mongo/contact.repository.ts`
- Modify: `server/src/repositories/postgres/schema.ts`
- Create: `server/src/repositories/postgres/contact.repository.ts`
- Modify: `server/src/repositories/mongo/index.ts`, `server/src/repositories/postgres/index.ts`
- Modify: `server/tests/contract/harness.ts`
- Test: `server/tests/contract/contact.contract.test.ts`

**Interfaces:**
- Produces (used by Tasks 2+):

```ts
export type ContactRecord = {
  id: string;
  ownerId: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface ContactRepository {
  /** Idempotent save: returns the existing contact for (ownerId, email) if present. */
  upsertForOwner(
    input: { ownerId: string; email: string; displayName?: string | null },
    tx?: TxContext
  ): Promise<ContactRecord>;
  listForOwner(ownerId: string, tx?: TxContext): Promise<ContactRecord[]>;
  /** Returns false when no row matched (wrong id or wrong owner). */
  deleteForOwner(input: { ownerId: string; id: string }, tx?: TxContext): Promise<boolean>;
}
```

- [ ] **Step 1: Write the failing contract test**

```ts
// server/tests/contract/contact.contract.test.ts
import { describeContract } from "./harness.js";

const OWNER_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OWNER_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describeContract("contacts", {
  "upsert creates a contact and normalizes the email to lowercase": async ({ repos }) => {
    const contact = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "Dan@Example.com",
      displayName: "Dan"
    });
    expect(contact.ownerId).toBe(OWNER_A);
    expect(contact.email).toBe("dan@example.com");
    expect(contact.displayName).toBe("Dan");
    expect(contact.id).toMatch(/^[0-9a-f]{24}$/);
  },

  "upsert is idempotent per (owner, email)": async ({ repos }) => {
    const first = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "dan@example.com",
      displayName: "Dan"
    });
    const second = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "DAN@example.com"
    });
    expect(second.id).toBe(first.id);
    const list = await repos.contacts.listForOwner(OWNER_A);
    expect(list).toHaveLength(1);
  },

  "listForOwner returns only the owner's contacts, newest first": async ({ repos }) => {
    await repos.contacts.upsertForOwner({ ownerId: OWNER_A, email: "a@example.com" });
    await repos.contacts.upsertForOwner({ ownerId: OWNER_A, email: "b@example.com" });
    await repos.contacts.upsertForOwner({ ownerId: OWNER_B, email: "c@example.com" });

    const list = await repos.contacts.listForOwner(OWNER_A);
    expect(list.map((c) => c.email)).toEqual(["b@example.com", "a@example.com"]);
  },

  "deleteForOwner removes the contact and is owner-scoped": async ({ repos }) => {
    const contact = await repos.contacts.upsertForOwner({
      ownerId: OWNER_A,
      email: "a@example.com"
    });

    expect(await repos.contacts.deleteForOwner({ ownerId: OWNER_B, id: contact.id })).toBe(false);
    expect(await repos.contacts.listForOwner(OWNER_A)).toHaveLength(1);

    expect(await repos.contacts.deleteForOwner({ ownerId: OWNER_A, id: contact.id })).toBe(true);
    expect(await repos.contacts.listForOwner(OWNER_A)).toHaveLength(0);
  }
});
```

> Two contacts created in the same test may share a `createdAt` millisecond, making "newest first" ambiguous.
> If the ordering case flakes, insert a `await new Promise((r) => setTimeout(r, 5));` between the two Owner-A upserts.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:contract --workspace server`
Expected: FAIL at compile time - `repos.contacts` does not exist on `Repositories`.

- [ ] **Step 3: Add the interface to `types.ts`**

Add `ContactRecord` and `ContactRepository` (exact code in Interfaces above) near `VerificationTokenRecord`/`VerificationTokenRepository`, and add to the `Repositories` interface:

```ts
  contacts: ContactRepository;
```

- [ ] **Step 4: Mongoose model**

```ts
// server/src/models/Contact.ts
import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, default: null }
  },
  { timestamps: true }
);

contactSchema.index({ ownerId: 1, email: 1 }, { unique: true });

export const Contact = mongoose.model("Contact", contactSchema);
```

- [ ] **Step 5: Mongo repository**

```ts
// server/src/repositories/mongo/contact.repository.ts
import { Contact } from "../../models/Contact.js";
import type { ContactRecord, ContactRepository, TxContext } from "../types.js";
import { asSession } from "./transaction.js";

function toContactRecord(d: Record<string, unknown>): ContactRecord {
  return {
    id: String(d._id),
    ownerId: String(d.ownerId),
    email: d.email as string,
    displayName: (d.displayName as string | null) ?? null,
    createdAt: d.createdAt as Date,
    updatedAt: d.updatedAt as Date
  };
}

export const mongoContactRepository: ContactRepository = {
  async upsertForOwner({ ownerId, email, displayName }, tx?: TxContext) {
    const doc = await Contact.findOneAndUpdate(
      { ownerId, email: email.toLowerCase() },
      { $setOnInsert: { displayName: displayName ?? null } },
      { upsert: true, new: true, session: asSession(tx) }
    ).lean();
    if (!doc) throw new Error("upsertForOwner: findOneAndUpdate returned null unexpectedly");
    return toContactRecord(doc as Record<string, unknown>);
  },

  async listForOwner(ownerId, tx?: TxContext) {
    const docs = await Contact.find({ ownerId }, null, { session: asSession(tx) })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return docs.map((d) => toContactRecord(d as Record<string, unknown>));
  },

  async deleteForOwner({ ownerId, id }, tx?: TxContext) {
    const res = await Contact.deleteOne({ _id: id, ownerId }, { session: asSession(tx) });
    return (res.deletedCount ?? 0) > 0;
  }
};
```

- [ ] **Step 6: Postgres schema + repository**

Add to `server/src/repositories/postgres/schema.ts` (same style as the existing tables; `char(24)` ids, timezone timestamps):

```ts
export const contacts = pgTable(
  "contacts",
  {
    id: char("id", { length: 24 }).primaryKey(),
    ownerId: char("owner_id", { length: 24 }).notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (t) => [
    uniqueIndex("contacts_owner_email_uq").on(t.ownerId, t.email),
    index("contacts_owner_idx").on(t.ownerId)
  ]
);
```

```ts
// server/src/repositories/postgres/contact.repository.ts
import { and, desc, eq } from "drizzle-orm";
import { contacts } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId } from "./id.js";
import type { ContactRecord, ContactRepository, TxContext } from "../types.js";

type Row = typeof contacts.$inferSelect;

function toRecord(r: Row): ContactRecord {
  return {
    id: r.id,
    ownerId: r.ownerId,
    email: r.email,
    displayName: r.displayName ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresContactRepository: ContactRepository = {
  async upsertForOwner({ ownerId, email, displayName }, tx?: TxContext) {
    const now = new Date();
    const [row] = await asPgTx(tx)
      .insert(contacts)
      .values({
        id: newObjectId(),
        ownerId,
        email: email.toLowerCase(),
        displayName: displayName ?? null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [contacts.ownerId, contacts.email],
        set: { updatedAt: now }
      })
      .returning();
    if (!row) {
      throw new Error("upsertForOwner: insert/update returned no row.");
    }
    return toRecord(row);
  },

  async listForOwner(ownerId: string, tx?: TxContext) {
    const rows = await asPgTx(tx)
      .select()
      .from(contacts)
      .where(eq(contacts.ownerId, ownerId))
      .orderBy(desc(contacts.createdAt), desc(contacts.id));
    return rows.map(toRecord);
  },

  async deleteForOwner({ ownerId, id }: { ownerId: string; id: string }, tx?: TxContext) {
    const rows = await asPgTx(tx)
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)))
      .returning({ id: contacts.id });
    return rows.length > 0;
  }
};
```

- [ ] **Step 7: Wire both factories and the contract harness**

In `mongo/index.ts`: import `mongoContactRepository` and add `contacts: mongoContactRepository,` to the returned object.
In `postgres/index.ts`: same with `postgresContactRepository` (match how the other postgres repositories are constructed there; some take the `db` handle).
In `server/tests/contract/harness.ts`: add `"contacts"` to `PG_TABLES` so each case truncates it.

- [ ] **Step 8: Generate and apply the Postgres migration**

Run (from `server/`):

```bash
npm run db:generate
docker compose -f ../docker-compose.test.yml up -d
```

Expected: a new migration file appears under `server/drizzle/` creating `contacts` with the unique index.
The contract harness runs `runPgMigrations()` in `beforeAll`, so the test database picks it up automatically.

- [ ] **Step 9: Run the contract suite against both drivers**

```bash
CONTRACT_PG_URL=postgres://virly:virly@localhost:5433/virly \
CONTRACT_MONGO_URL="mongodb://localhost:27018/virly_contract?directConnection=true" \
CONTRACT_VECTOR_URL=postgres://virly:virly@localhost:5433/virly \
  npm run test:contract --workspace server
```

Expected: `[postgres] contacts` and `[mongo] contacts` both PASS (4 cases each); all pre-existing contract suites stay green.
Also run `npm run test:server` - the `no-direct-model-imports` architectural test must stay green (the new model is only imported from `repositories/mongo/`).

- [ ] **Step 10: Commit**

```bash
git add server/src/repositories/types.ts server/src/models/Contact.ts server/src/repositories/mongo/contact.repository.ts server/src/repositories/mongo/index.ts server/src/repositories/postgres/schema.ts server/src/repositories/postgres/contact.repository.ts server/src/repositories/postgres/index.ts server/tests/contract/harness.ts server/tests/contract/contact.contract.test.ts server/drizzle
git commit -m "feat(contacts): contacts repository across both drivers with contract tests"
```

---

## Task 2: Contacts service (TDD)

**Files:**
- Create: `server/src/services/contacts.service.ts`
- Test: `server/src/services/__tests__/contacts.service.test.ts`

**Interfaces:**
- Consumes: `getRepositories()` / `setRepositories()` (`repositories/index.ts`), `AppError` (`utils/app-error.ts`), `ContactRecord` (Task 1).
- Produces:

```ts
export const contactsService = {
  addContact(input: { ownerId: string; email: string; displayName?: string | null }): Promise<ContactRecord>;
  listContacts(ownerId: string): Promise<ContactRecord[]>;
  removeContact(input: { ownerId: string; id: string }): Promise<void>;
};
```

- [ ] **Step 1: Write the failing test**

Follow the repo's service-test pattern (see `server/src/services/__tests__/account.service.test.ts`): build a base repo set with `createMongoRepositories()` and override members via `setRepositories`.

```ts
// server/src/services/__tests__/contacts.service.test.ts
import { AppError } from "../../utils/app-error.js";
import { contactsService } from "../contacts.service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import type { ContactRecord, Repositories } from "../../repositories/types.js";

const OWNER = "507f1f77bcf86cd799439011";
const OTHER_USER = {
  id: "507f1f77bcf86cd799439022",
  email: "dan@example.com",
  passwordHash: "x",
  phone: "+972",
  isVerified: true,
  personalDetails: null,
  balance: 0,
  role: "user",
  createdAt: new Date(0),
  updatedAt: new Date(0)
};

function contactRecord(over: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "507f1f77bcf86cd799439033",
    ownerId: OWNER,
    email: "dan@example.com",
    displayName: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over
  };
}

function withStubs(stubs: {
  users?: Partial<Repositories["users"]>;
  contacts?: Partial<Repositories["contacts"]>;
}) {
  const base = createMongoRepositories();
  setRepositories({
    ...base,
    users: { ...base.users, ...stubs.users } as Repositories["users"],
    contacts: { ...base.contacts, ...stubs.contacts } as Repositories["contacts"]
  });
}

test("addContact normalizes the email and saves via upsert", async () => {
  const calls: unknown[] = [];
  withStubs({
    users: {
      findByEmail: async (email) => (email === "dan@example.com" ? (OTHER_USER as never) : null),
      findByIdSafe: async () => ({ ...OTHER_USER, id: OWNER, email: "me@example.com" }) as never
    },
    contacts: {
      upsertForOwner: async (input) => {
        calls.push(input);
        return contactRecord({ email: input.email });
      }
    }
  });

  const saved = await contactsService.addContact({ ownerId: OWNER, email: " Dan@Example.com " });
  expect(saved.email).toBe("dan@example.com");
  expect(calls).toEqual([{ ownerId: OWNER, email: "dan@example.com", displayName: null }]);
});

test("addContact rejects an email with no registered user (404)", async () => {
  withStubs({
    users: {
      findByEmail: async () => null,
      findByIdSafe: async () => ({ ...OTHER_USER, id: OWNER, email: "me@example.com" }) as never
    }
  });

  const err = await contactsService
    .addContact({ ownerId: OWNER, email: "ghost@example.com" })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(404);
});

test("addContact rejects saving yourself (400)", async () => {
  withStubs({
    users: {
      findByEmail: async () => OTHER_USER as never,
      findByIdSafe: async () => ({ ...OTHER_USER, id: OWNER }) as never
    }
  });

  const err = await contactsService
    .addContact({ ownerId: OWNER, email: OTHER_USER.email })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
});

test("removeContact throws 404 when nothing was deleted", async () => {
  withStubs({ contacts: { deleteForOwner: async () => false } });

  const err = await contactsService
    .removeContact({ ownerId: OWNER, id: "507f1f77bcf86cd799439099" })
    .then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(404);
});

test("listContacts delegates to the repository", async () => {
  withStubs({ contacts: { listForOwner: async () => [contactRecord()] } });
  const list = await contactsService.listContacts(OWNER);
  expect(list).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:server -- src/services/__tests__/contacts.service.test.ts`
Expected: FAIL - cannot find module `../contacts.service.js`.

- [ ] **Step 3: Implement the service**

```ts
// server/src/services/contacts.service.ts
import { getRepositories } from "../repositories/index.js";
import { AppError } from "../utils/app-error.js";
import type { ContactRecord } from "../repositories/types.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const contactsService = {
  async addContact(input: {
    ownerId: string;
    email: string;
    displayName?: string | null;
  }): Promise<ContactRecord> {
    const repos = getRepositories();
    const email = normalizeEmail(input.email);

    const target = await repos.users.findByEmail(email);
    if (!target) {
      throw new AppError(404, "No Virly user exists with that email.");
    }

    const owner = await repos.users.findByIdSafe(input.ownerId);
    if (owner && owner.email.toLowerCase() === email) {
      throw new AppError(400, "You cannot save yourself as a contact.");
    }

    return repos.contacts.upsertForOwner({
      ownerId: input.ownerId,
      email,
      displayName: input.displayName?.trim() || null
    });
  },

  async listContacts(ownerId: string): Promise<ContactRecord[]> {
    return getRepositories().contacts.listForOwner(ownerId);
  },

  async removeContact(input: { ownerId: string; id: string }): Promise<void> {
    const deleted = await getRepositories().contacts.deleteForOwner(input);
    if (!deleted) {
      throw new AppError(404, "Contact not found.");
    }
  }
};
```

> Check `server/src/utils/app-error.ts` for the exact `AppError` constructor argument order before implementing; the existing service tests assert `err.status`, so `(status, message)` is expected.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:server -- src/services/__tests__/contacts.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/contacts.service.ts server/src/services/__tests__/contacts.service.test.ts
git commit -m "feat(contacts): contacts service with ownership and registered-user checks"
```

---

## Task 3: HTTP routes + OpenAPI

**Files:**
- Create: `server/src/routes/contacts.routes.ts`
- Modify: `server/src/app.ts`
- Modify: `openapi.yaml`

**Interfaces:**
- Consumes: `contactsService` (Task 2), `requireAuth` (`middleware/auth.ts`, sets `req.userId`).
- Produces HTTP contract:
  - `GET /api/contacts` -> `200 { contacts: ContactDto[] }`
  - `POST /api/contacts { email, displayName? }` -> `201 { contact: ContactDto }` (also 201 when it already existed - idempotent)
  - `DELETE /api/contacts/:id` -> `204`
  - `ContactDto = { id: string; email: string; displayName: string | null; createdAt: string }`

- [ ] **Step 1: Implement the routes**

```ts
// server/src/routes/contacts.routes.ts
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { contactsService } from "../services/contacts.service.js";
import type { ContactRecord } from "../repositories/types.js";

const router = Router();
router.use(requireAuth);

const addContactSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  displayName: z.string().trim().max(80).optional()
});

function toDto(record: ContactRecord) {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    createdAt: record.createdAt.toISOString()
  };
}

router.get("/", async (req, res, next) => {
  try {
    const contacts = await contactsService.listContacts(req.userId as string);
    return res.json({ contacts: contacts.map(toDto) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = addContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Provide a valid contact email." });
    }
    const contact = await contactsService.addContact({
      ownerId: req.userId as string,
      email: parsed.data.email,
      displayName: parsed.data.displayName ?? null
    });
    return res.status(201).json({ contact: toDto(contact) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await contactsService.removeContact({
      ownerId: req.userId as string,
      id: req.params.id
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
```

> Match the surrounding conventions before finalizing: how `req.userId` is typed (see any existing authed route, e.g. `userProfile.routes.ts`), whether routes export default or named, and how zod failures are shaped elsewhere. Adjust this file to whatever those neighbors do.

- [ ] **Step 2: Mount in `app.ts`**

Next to the existing mounts (after `app.use("/api/transactions", transactionRoutes);`):

```ts
app.use("/api/contacts", contactsRoutes);
```

with the corresponding import `import contactsRoutes from "./routes/contacts.routes.js";` (match the import style of the neighboring route imports).

- [ ] **Step 3: Typecheck + full server suite**

Run: `npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: PASS.

- [ ] **Step 4: Manual smoke over HTTP**

With `npm run dev:server` running and a logged-in session cookie (log in via the client or curl the auth endpoint), verify:

```bash
# list (empty at first)
curl -s -b cookies.txt http://localhost:3000/api/contacts
# save (needs the CSRF header; easiest from the browser devtools console:)
# await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/virly_csrf=([^;]+)/)[1] }, body: JSON.stringify({ email: "lebron@lakers.com" }) }).then(r => r.json())
```

Expected: 401 without auth; 201 then the contact appears in GET; DELETE returns 204; deleting again returns 404.

- [ ] **Step 5: Document in `openapi.yaml`**

Add a `Contacts` tag and the three paths, following the exact conventions of `/api/accounts/me` (cookieAuth security, `$ref` schemas):

```yaml
  /api/contacts:
    get:
      tags: [Contacts]
      summary: List the current user's saved contacts
      security:
        - cookieAuth: []
      responses:
        '200':
          description: Saved contacts, newest first
          content:
            application/json:
              schema:
                type: object
                required: [contacts]
                properties:
                  contacts:
                    type: array
                    items:
                      $ref: '#/components/schemas/Contact'
    post:
      tags: [Contacts]
      summary: Save a registered user as a contact (idempotent)
      security:
        - cookieAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email: { type: string, format: email }
                displayName: { type: string, maxLength: 80 }
      responses:
        '201':
          description: The saved (or pre-existing) contact
          content:
            application/json:
              schema:
                type: object
                required: [contact]
                properties:
                  contact:
                    $ref: '#/components/schemas/Contact'
        '404':
          description: No registered user with that email
  /api/contacts/{id}:
    delete:
      tags: [Contacts]
      summary: Remove a saved contact
      security:
        - cookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '204':
          description: Deleted
        '404':
          description: Not found for this user
```

And under `components/schemas`:

```yaml
    Contact:
      type: object
      required: [id, email, displayName, createdAt]
      properties:
        id: { type: string }
        email: { type: string, format: email }
        displayName: { type: string, nullable: true }
        createdAt: { type: string, format: date-time }
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/contacts.routes.ts server/src/app.ts openapi.yaml
git commit -m "feat(contacts): contacts HTTP endpoints"
```

---

## Task 4: Client API + merge helper (TDD)

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/lib/contacts.ts`
- Test: `client/src/lib/__tests__/contacts.test.ts` (extend)

**Interfaces:**
- Consumes: `QuickContact` (`lib/contacts.ts`), `request` helper (`lib/api.ts`).
- Produces:
  - `type Contact = { id: string; email: string; displayName: string | null; createdAt: string }` and `type ContactsResponse = { contacts: Contact[] }` in `types.ts`.
  - `api.contacts(): Promise<ContactsResponse>`, `api.addContact(payload: { email: string; displayName?: string }): Promise<{ contact: Contact }>`, `api.deleteContact(id: string): Promise<void>`.
  - `type RecipientBookEntry = QuickContact & { contactId?: string; displayName?: string | null }`.
  - `function mergeRecipientBook(saved: Contact[], recent: QuickContact[]): { saved: RecipientBookEntry[]; recent: RecipientBookEntry[] }` - recents already saved are removed from the recent group.

- [ ] **Step 1: Write the failing tests**

Append to `client/src/lib/__tests__/contacts.test.ts`:

```ts
import { mergeRecipientBook } from "../contacts";
import type { Contact } from "../types";

function contact(email: string, displayName: string | null = null): Contact {
  return { id: `id-${email}`, email, displayName, createdAt: "2026-07-01T00:00:00.000Z" };
}

describe("mergeRecipientBook", () => {
  test("keeps saved and recent as separate groups", () => {
    const book = mergeRecipientBook(
      [contact("dan@example.com", "Dan")],
      [{ email: "alice@example.com", avatar: "A" }]
    );
    expect(book.saved.map((c) => c.email)).toEqual(["dan@example.com"]);
    expect(book.recent.map((c) => c.email)).toEqual(["alice@example.com"]);
  });

  test("drops recents that are already saved (case-insensitive)", () => {
    const book = mergeRecipientBook(
      [contact("dan@example.com")],
      [
        { email: "Dan@Example.com", avatar: "D" },
        { email: "alice@example.com", avatar: "A" }
      ]
    );
    expect(book.recent.map((c) => c.email)).toEqual(["alice@example.com"]);
  });

  test("saved entries carry contactId, displayName, and an initials avatar", () => {
    const book = mergeRecipientBook([contact("dan@example.com", "Dan Levi")], []);
    expect(book.saved[0].contactId).toBe("id-dan@example.com");
    expect(book.saved[0].displayName).toBe("Dan Levi");
    expect(book.saved[0].avatar).toBe("DL");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:client -- contacts`
Expected: FAIL - `mergeRecipientBook` is not exported.

- [ ] **Step 3: Implement types, api functions, and the helper**

`client/src/lib/types.ts`:

```ts
export type Contact = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

export type ContactsResponse = {
  contacts: Contact[];
};
```

`client/src/lib/api.ts` (inside the `api` object, matching the style of the neighboring methods):

```ts
  contacts() {
    return request<ContactsResponse>("/api/contacts");
  },
  addContact(payload: { email: string; displayName?: string }) {
    return request<{ contact: Contact }>("/api/contacts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  deleteContact(id: string) {
    return request<void>(`/api/contacts/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
```

`client/src/lib/contacts.ts` - add (reusing the file's existing initials logic; if the initials derivation is inline in `getQuickContacts`, extract it into a local `initialsFrom(text: string)` used by both):

```ts
import type { Contact } from "./types";

export type RecipientBookEntry = QuickContact & {
  contactId?: string;
  displayName?: string | null;
};

export function mergeRecipientBook(
  saved: Contact[],
  recent: QuickContact[]
): { saved: RecipientBookEntry[]; recent: RecipientBookEntry[] } {
  const savedEmails = new Set(saved.map((c) => c.email.toLowerCase()));

  return {
    saved: saved.map((c) => ({
      email: c.email,
      avatar: initialsFrom(c.displayName?.trim() || c.email),
      contactId: c.id,
      displayName: c.displayName
    })),
    recent: recent.filter((c) => !savedEmails.has(c.email.toLowerCase()))
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:client -- contacts`
Expected: PASS (existing `getQuickContacts` tests included).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/api.ts client/src/lib/contacts.ts client/src/lib/__tests__/contacts.test.ts
git commit -m "feat(contacts): client contacts api and recipient-book merge helper"
```

---

## Task 5: `RecipientBook` component (TDD)

**Files:**
- Create: `client/src/features/transfer/RecipientBook.tsx`
- Create: `client/src/features/transfer/__stories__/RecipientBook.stories.tsx`
- Modify: `client/src/styles/global.css`
- Test: `client/src/features/transfer/__tests__/RecipientBook.test.tsx`

**Interfaces:**
- Consumes: `RecipientBookEntry` (Task 4).
- Produces:

```ts
function RecipientBook(props: {
  saved: RecipientBookEntry[];
  recent: RecipientBookEntry[];
  selectedEmail: string;
  disabled?: boolean;
  onSelect: (email: string) => void;
  onSave: (email: string) => void;
  onRemove: (contactId: string) => void;
}): JSX.Element | null;
```

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/features/transfer/__tests__/RecipientBook.test.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipientBook } from "../RecipientBook";

const saved = [
  { email: "dan@example.com", avatar: "DL", contactId: "c1", displayName: "Dan Levi" }
];
const recent = [{ email: "alice@example.com", avatar: "A" }];
const noop = () => {};

test("renders saved and recent groups with labels", () => {
  const html = renderToStaticMarkup(
    <RecipientBook
      saved={saved}
      recent={recent}
      selectedEmail=""
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );

  expect(html).toMatch(/Saved contacts/);
  expect(html).toMatch(/Recent payees/);
  expect(html).toMatch(/Dan Levi/);
  expect(html).toMatch(/alice@example\.com/);
});

test("saved chips expose a remove action; recent chips expose a save action", () => {
  const html = renderToStaticMarkup(
    <RecipientBook
      saved={saved}
      recent={recent}
      selectedEmail=""
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );

  expect(html).toMatch(/aria-label="Remove Dan Levi from contacts"/);
  expect(html).toMatch(/aria-label="Save alice@example\.com as a contact"/);
});

test("marks the selected email and renders nothing when both groups are empty", () => {
  const selected = renderToStaticMarkup(
    <RecipientBook
      saved={saved}
      recent={[]}
      selectedEmail="dan@example.com"
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );
  expect(selected).toMatch(/cheque-payee-chip selected/);

  const empty = renderToStaticMarkup(
    <RecipientBook
      saved={[]}
      recent={[]}
      selectedEmail=""
      onSelect={noop}
      onSave={noop}
      onRemove={noop}
    />
  );
  expect(empty).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client -- RecipientBook`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement the component**

The chip visuals reuse the existing `cheque-payeebook` / `cheque-payee-chip` classes from `TransferPage.tsx` (see its "Recent payees" block); action buttons are siblings, not nested buttons (nested buttons are invalid HTML).

```tsx
// client/src/features/transfer/RecipientBook.tsx
import { Star, X } from "lucide-react";
import type { RecipientBookEntry } from "../../lib/contacts";

function ChipRow({
  entry,
  selected,
  disabled,
  onSelect,
  action,
}: {
  entry: RecipientBookEntry;
  selected: boolean;
  disabled?: boolean;
  onSelect: (email: string) => void;
  action: { label: string; icon: JSX.Element; onClick: () => void };
}) {
  return (
    <div className="payee-chip-row">
      <button
        type="button"
        className={selected ? "cheque-payee-chip selected" : "cheque-payee-chip"}
        disabled={disabled}
        onClick={() => onSelect(entry.email)}
      >
        <span aria-hidden="true">{entry.avatar}</span>
        <strong>{entry.displayName?.trim() || entry.email}</strong>
      </button>
      <button
        type="button"
        className="payee-chip-action"
        aria-label={action.label}
        disabled={disabled}
        onClick={action.onClick}
      >
        {action.icon}
      </button>
    </div>
  );
}

export function RecipientBook({
  saved,
  recent,
  selectedEmail,
  disabled,
  onSelect,
  onSave,
  onRemove,
}: {
  saved: RecipientBookEntry[];
  recent: RecipientBookEntry[];
  selectedEmail: string;
  disabled?: boolean;
  onSelect: (email: string) => void;
  onSave: (email: string) => void;
  onRemove: (contactId: string) => void;
}) {
  if (!saved.length && !recent.length) {
    return null;
  }

  return (
    <div className="cheque-payeebook" aria-label="Recipient book">
      {saved.length ? (
        <>
          <span className="cheque-microlabel">Saved contacts</span>
          <div className="cheque-payeebook-grid">
            {saved.map((entry) => (
              <ChipRow
                key={entry.email}
                entry={entry}
                selected={selectedEmail === entry.email}
                disabled={disabled}
                onSelect={onSelect}
                action={{
                  label: `Remove ${entry.displayName?.trim() || entry.email} from contacts`,
                  icon: <X aria-hidden="true" />,
                  onClick: () => entry.contactId && onRemove(entry.contactId),
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      {recent.length ? (
        <>
          <span className="cheque-microlabel">Recent payees</span>
          <div className="cheque-payeebook-grid">
            {recent.map((entry) => (
              <ChipRow
                key={entry.email}
                entry={entry}
                selected={selectedEmail === entry.email}
                disabled={disabled}
                onSelect={onSelect}
                action={{
                  label: `Save ${entry.email} as a contact`,
                  icon: <Star aria-hidden="true" />,
                  onClick: () => onSave(entry.email),
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add the chip-action styles**

In `client/src/styles/global.css`, next to the existing `.cheque-payee-chip` rules:

```css
.payee-chip-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.payee-chip-action {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  color: var(--color-muted);
  cursor: pointer;
}

.payee-chip-action:hover {
  color: var(--color-primary);
}

.payee-chip-action svg {
  width: 12px;
  height: 12px;
}
```

- [ ] **Step 5: Run tests, then add the story**

Run: `npm run test:client -- RecipientBook`
Expected: PASS.

```tsx
// client/src/features/transfer/__stories__/RecipientBook.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipientBook } from "../RecipientBook";

const meta = {
  title: "Transfer/RecipientBook",
  component: RecipientBook,
  parameters: { layout: "padded" },
  args: {
    saved: [
      { email: "dan@example.com", avatar: "DL", contactId: "c1", displayName: "Dan Levi" },
      { email: "maya@virly.test", avatar: "MC", contactId: "c2", displayName: "Maya Cohen" },
    ],
    recent: [{ email: "alice@example.com", avatar: "A" }],
    selectedEmail: "dan@example.com",
    onSelect: () => {},
    onSave: () => {},
    onRemove: () => {},
  },
} satisfies Meta<typeof RecipientBook>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No saved contacts yet - only the derived recents with save affordances. */
export const RecentOnly: Story = {
  args: { saved: [] },
};
```

- [ ] **Step 6: Commit**

```bash
git add client/src/features/transfer/RecipientBook.tsx client/src/features/transfer/__tests__/RecipientBook.test.tsx client/src/features/transfer/__stories__/RecipientBook.stories.tsx client/src/styles/global.css
git commit -m "feat(transfer): RecipientBook with saved contacts and recent payees"
```

---

## Task 6: Wire the transfer page

**Files:**
- Modify: `client/src/features/transfer/TransferPage.tsx`

**Interfaces:**
- Consumes: `api.contacts` / `api.addContact` / `api.deleteContact` (Task 4), `mergeRecipientBook` (Task 4), `RecipientBook` (Task 5), existing page state `recipientEmail` / `setRecipientEmail` / `recentCounterparties`.

- [ ] **Step 1: Fetch contacts and build the book**

Add state and a loader alongside the existing account-summary effect:

```tsx
const [savedContacts, setSavedContacts] = useState<Contact[]>([]);

const loadContacts = useCallback(() => {
  api
    .contacts()
    .then((response) => setSavedContacts(response.contacts))
    .catch(() => setSavedContacts([]));
}, []);

useEffect(() => {
  loadContacts();
}, [loadContacts]);

const recipientBook = useMemo(
  () => mergeRecipientBook(savedContacts, recentCounterparties),
  [savedContacts, recentCounterparties]
);
```

(Imports: `Contact` from `../../lib/types`, `mergeRecipientBook` from `../../lib/contacts`, `RecipientBook` from `./RecipientBook`, plus `useCallback` if not already imported.)

- [ ] **Step 2: Replace the inline "Recent payees" block**

Replace the whole `{recentCounterparties.length ? (<div className="cheque-payeebook" ...>...</div>) : null}` block with:

```tsx
<RecipientBook
  saved={recipientBook.saved}
  recent={recipientBook.recent}
  selectedEmail={recipientEmail}
  disabled={isSubmitting}
  onSelect={setRecipientEmail}
  onSave={(email) => {
    api.addContact({ email }).then(loadContacts).catch(() => {});
  }}
  onRemove={(contactId) => {
    api.deleteContact(contactId).then(loadContacts).catch(() => {});
  }}
/>
```

- [ ] **Step 3: Keep the page tests green + typecheck**

Run: `npm run test:client && cd client && npx tsc -b`
Expected: PASS.
`TransferPage.test.tsx` renders statically (api promises never resolve), so both groups render empty and existing assertions hold; update a selector only if it asserted the exact old payeebook markup.

- [ ] **Step 4: End-to-end verification**

With both dev servers running, log in as `sga@thunder.com` / `admin1234` and verify on `/transfer`:

1. Recent payees appear as before (derived from transactions).
2. Clicking the star on a recent chip moves it to "Saved contacts" (it disappears from recent - dedupe).
3. Reload the page: the saved contact persists (server-side now, unlike recents).
4. Clicking a saved chip fills the recipient field; the X removes it and it reappears under recent if still in the last transactions.
5. Saving an email twice does not duplicate; saving an unregistered email fails without breaking the page.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/transfer/TransferPage.tsx
git commit -m "feat(transfer): recipient book with persistent saved contacts"
```

---

## Self-Review

- **Spec coverage:** "אנשי קשר" (contacts) - Tasks 1-6 add persistent, explicit contacts end to end; "recent" - preserved, deduped against saved, and given a save affordance (Tasks 4-6).
- **Placeholder scan:** the "match the surrounding conventions" notes (route export style, `AppError` ctor, initials extraction) each point at a named in-repo file to copy from.
- **Type consistency:** `ContactRecord` (server) vs `Contact` (client DTO, `createdAt` as ISO string via `toDto`) are deliberately distinct and each used consistently; `RecipientBookEntry` fields (`contactId`, `displayName`) match between helper (Task 4), component (Task 5), and page wiring (Task 6); `upsertForOwner`/`listForOwner`/`deleteForOwner` signatures are identical across interface, both drivers, contract tests, and service.

## Open questions (answer later)

1. Should the dashboard "Quick Send" card also merge saved contacts (currently transaction-derived only)? Natural follow-up once this ships; one `mergeRecipientBook` call away.
2. Should a successful transfer offer "save this recipient" inline on the success screen?
3. Contact display-name editing (rename) - worth a `PATCH /api/contacts/:id` later; `upsertForOwner` deliberately does not overwrite the name today.
4. The AI assistant could read contacts for recipient resolution (`counterpartyMemory` currently learns only from transactions); requires a read tool and a masking decision - defer to the email-masking design task.
