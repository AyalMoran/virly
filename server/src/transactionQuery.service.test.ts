
import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { Transaction } from "./models/Transaction.js";
import { transactionQueryService } from "./services/transactionQuery.service.js";

// A real 24-hex ObjectId — getRelationshipStats casts ownerId to ObjectId for
// the aggregate $match (Mongoose does not cast pipeline stages).
const OWNER_OID = "507f1f77bcf86cd799439011";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchModel<T extends object, K extends keyof T>(
  model: T,
  key: K,
  value: T[K],
  t: test.TestContext
) {
  const original = model[key];
  model[key] = value;
  t.after(() => {
    model[key] = original;
  });
}

type FakeDoc = { _id: string; ownerId: string; counterpartyEmail: string };

/**
 * Returns a chainable query mock. Records which filter was passed to .find()
 * and which modifiers were applied (.sort/.skip/.limit), then resolves to
 * `results`.
 */
function makeFindChain(results: FakeDoc[]) {
  const applied: { sortArg?: unknown; skipArg?: number; limitArg?: number } = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    sort(arg: unknown) {
      applied.sortArg = arg;
      return chain;
    },
    skip(n: number) {
      applied.skipArg = n;
      return chain;
    },
    limit(n: number) {
      applied.limitArg = n;
      return chain;
    },
    then(resolve: (v: FakeDoc[]) => void, reject: (e: unknown) => void) {
      Promise.resolve(results).then(resolve, reject);
    }
  };
  return { chain, applied };
}

// ---------------------------------------------------------------------------
// listForOwner
// ---------------------------------------------------------------------------

test("listForOwner: ownerId scoping is always applied", async (t) => {
  const capturedFilters: unknown[] = [];
  patchModel(
    Transaction,
    "find",
    ((filter: unknown) => {
      capturedFilters.push(filter);
      const { chain } = makeFindChain([]);
      return chain;
    }) as unknown as typeof Transaction.find,
    t
  );
  patchModel(
    Transaction,
    "countDocuments",
    (async (_filter: unknown) => 0) as unknown as typeof Transaction.countDocuments,
    t
  );

  await transactionQueryService.listForOwner({
    ownerId: "owner-123",
    page: 1,
    limit: 10
  });

  assert.equal(capturedFilters.length, 1);
  const filter = capturedFilters[0] as Record<string, unknown>;
  assert.equal(filter.ownerId, "owner-123");
});

test("listForOwner: counterpartyEmail filter applied when provided", async (t) => {
  const capturedFilters: unknown[] = [];
  patchModel(
    Transaction,
    "find",
    ((filter: unknown) => {
      capturedFilters.push(filter);
      const { chain } = makeFindChain([]);
      return chain;
    }) as unknown as typeof Transaction.find,
    t
  );
  patchModel(
    Transaction,
    "countDocuments",
    (async (_filter: unknown) => 0) as unknown as typeof Transaction.countDocuments,
    t
  );

  await transactionQueryService.listForOwner({
    ownerId: "owner-123",
    counterpartyEmail: "alice@example.com",
    page: 1,
    limit: 10
  });

  const filter = capturedFilters[0] as Record<string, unknown>;
  assert.equal(filter.ownerId, "owner-123");
  assert.equal(filter.counterpartyEmail, "alice@example.com");
});

test("listForOwner: no counterpartyEmail when not provided", async (t) => {
  const capturedFilters: unknown[] = [];
  patchModel(
    Transaction,
    "find",
    ((filter: unknown) => {
      capturedFilters.push(filter);
      const { chain } = makeFindChain([]);
      return chain;
    }) as unknown as typeof Transaction.find,
    t
  );
  patchModel(
    Transaction,
    "countDocuments",
    (async (_filter: unknown) => 0) as unknown as typeof Transaction.countDocuments,
    t
  );

  await transactionQueryService.listForOwner({
    ownerId: "owner-123",
    page: 1,
    limit: 10
  });

  const filter = capturedFilters[0] as Record<string, unknown>;
  assert.equal(Object.hasOwn(filter, "counterpartyEmail"), false);
});

test("listForOwner: skip is computed as (page-1)*limit", async (t) => {
  const { chain, applied } = makeFindChain([]);

  patchModel(
    Transaction,
    "find",
    ((_filter: unknown) => chain) as unknown as typeof Transaction.find,
    t
  );
  patchModel(
    Transaction,
    "countDocuments",
    (async (_filter: unknown) => 0) as unknown as typeof Transaction.countDocuments,
    t
  );

  // page=3, limit=5 => skip=10
  await transactionQueryService.listForOwner({
    ownerId: "owner-123",
    page: 3,
    limit: 5
  });

  assert.equal(applied.skipArg, 10);
  assert.equal(applied.limitArg, 5);
  assert.deepEqual(applied.sortArg, { createdAt: -1 });
});

test("listForOwner: returns transactions and total from model", async (t) => {
  const fakeDocs = [
    { _id: "tx-1", ownerId: "owner-123", counterpartyEmail: "a@b.com" },
    { _id: "tx-2", ownerId: "owner-123", counterpartyEmail: "a@b.com" }
  ];
  const { chain } = makeFindChain(fakeDocs);

  patchModel(
    Transaction,
    "find",
    ((_filter: unknown) => chain) as unknown as typeof Transaction.find,
    t
  );
  patchModel(
    Transaction,
    "countDocuments",
    (async (_filter: unknown) => 42) as unknown as typeof Transaction.countDocuments,
    t
  );

  const result = await transactionQueryService.listForOwner({
    ownerId: "owner-123",
    page: 1,
    limit: 10
  });

  assert.deepEqual(result.transactions, fakeDocs);
  assert.equal(result.total, 42);
});

// ---------------------------------------------------------------------------
// getRelationshipStats
// ---------------------------------------------------------------------------

test("getRelationshipStats: ownerId scoping applied in aggregate $match", async (t) => {
  let capturedPipeline: unknown[] = [];
  patchModel(
    Transaction,
    "aggregate",
    (async (pipeline: unknown[]) => {
      capturedPipeline = pipeline;
      return [];
    }) as unknown as typeof Transaction.aggregate,
    t
  );

  await transactionQueryService.getRelationshipStats({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  const match = (capturedPipeline[0] as { $match: Record<string, unknown> }).$match;
  // Mongoose does not cast aggregate $match — ownerId must be an ObjectId so it
  // matches the ObjectId column (a plain string would match nothing).
  assert.ok(match.ownerId instanceof Types.ObjectId);
  assert.equal(String(match.ownerId), OWNER_OID);
  assert.equal(match.counterpartyEmail, "bob@example.com");
});

test("getRelationshipStats: returns correct totals for known fixture", async (t) => {
  patchModel(
    Transaction,
    "aggregate",
    (async () => [
      {
        totalSent: 500,
        totalReceived: 200.5,
        transactionCount: 7,
        lastTransactionAt: new Date("2026-06-10T08:00:00.000Z")
      }
    ]) as unknown as typeof Transaction.aggregate,
    t
  );

  const result = await transactionQueryService.getRelationshipStats({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  assert.equal(result.totalSent, 500);
  assert.equal(result.totalReceived, 200.5);
  assert.equal(result.transactionCount, 7);
  assert.deepEqual(
    result.lastTransactionAt,
    new Date("2026-06-10T08:00:00.000Z")
  );
});

test("getRelationshipStats: returns zero-defaults when aggregate returns empty", async (t) => {
  patchModel(
    Transaction,
    "aggregate",
    (async () => []) as unknown as typeof Transaction.aggregate,
    t
  );

  const result = await transactionQueryService.getRelationshipStats({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  assert.equal(result.totalSent, 0);
  assert.equal(result.totalReceived, 0);
  assert.equal(result.transactionCount, 0);
  assert.equal(result.lastTransactionAt, null);
});

// ---------------------------------------------------------------------------
// recentWithCounterparty
// ---------------------------------------------------------------------------

test("recentWithCounterparty: ownerId scoping applied", async (t) => {
  const capturedFilters: unknown[] = [];
  patchModel(
    Transaction,
    "find",
    ((filter: unknown) => {
      capturedFilters.push(filter);
      const { chain } = makeFindChain([]);
      return chain;
    }) as unknown as typeof Transaction.find,
    t
  );

  await transactionQueryService.recentWithCounterparty({
    ownerId: "owner-xyz",
    counterpartyEmail: "carol@example.com",
    limit: 5
  });

  const filter = capturedFilters[0] as Record<string, unknown>;
  assert.equal(filter.ownerId, "owner-xyz");
  assert.equal(filter.counterpartyEmail, "carol@example.com");
});

test("recentWithCounterparty: sorts descending and applies limit", async (t) => {
  const { chain, applied } = makeFindChain([]);
  patchModel(
    Transaction,
    "find",
    ((_filter: unknown) => chain) as unknown as typeof Transaction.find,
    t
  );

  await transactionQueryService.recentWithCounterparty({
    ownerId: "owner-xyz",
    counterpartyEmail: "carol@example.com",
    limit: 5
  });

  assert.deepEqual(applied.sortArg, { createdAt: -1 });
  assert.equal(applied.limitArg, 5);
  // recentWithCounterparty does NOT skip
  assert.equal(applied.skipArg, undefined);
});

test("recentWithCounterparty: returns the documents from model", async (t) => {
  const fakeDocs = [
    { _id: "tx-9", ownerId: "owner-xyz", counterpartyEmail: "carol@example.com" }
  ];
  const { chain } = makeFindChain(fakeDocs);
  patchModel(
    Transaction,
    "find",
    ((_filter: unknown) => chain) as unknown as typeof Transaction.find,
    t
  );

  const result = await transactionQueryService.recentWithCounterparty({
    ownerId: "owner-xyz",
    counterpartyEmail: "carol@example.com",
    limit: 5
  });

  assert.deepEqual(result, fakeDocs);
});
