
// src/repositories/mongo/transaction.repository.test.ts
// Tests: createMany, listForOwner, recentWithCounterparty, getRelationshipStats, getDirectionalTotals
import { Types } from "mongoose";
import { Transaction } from "../../../models/Transaction.js";
import { mongoTransactionRepository } from "../transaction.repository.js";
import { cleanups, patch, OWNER_OID, leanTx } from "./_transactionKit.js";

afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

// ---------------------------------------------------------------------------
// createMany
// ---------------------------------------------------------------------------

test("createMany: calls Transaction.create with session and returns records", async () => {
  let capturedDocs: unknown;
  let capturedOpts: unknown;
  patch(
    Transaction,
    "create",
    (async (docs: unknown, opts: unknown) => {
      capturedDocs = docs;
      capturedOpts = opts;
      return [{ ...leanTx, toObject: () => leanTx }];
    }) as unknown as typeof Transaction.create
  );

  const input = [{
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com",
    amount: 100,
    type: "debit" as const,
    directionLabel: "Sent",
    reason: "lunch"
  }];
  const records = await mongoTransactionRepository.createMany(input);

  expect(records.length).toBe(1);
  expect(records[0].id).toBe(leanTx._id);
  expect((records[0] as Record<string, unknown>)._id).toBeUndefined();
  expect(records[0].ownerId).toBe(OWNER_OID);
  expect(Array.isArray(capturedDocs)).toBeTruthy();
  expect((capturedOpts as Record<string, unknown>).ordered).toBe(true);
});

// ---------------------------------------------------------------------------
// listForOwner
// ---------------------------------------------------------------------------

test("listForOwner: returns TransactionRecords with string id", async () => {
  const fakeChain = {
    sort: () => fakeChain,
    skip: () => fakeChain,
    limit: () => fakeChain,
    lean: async () => [leanTx]
  };
  patch(Transaction, "find", ((_filter: unknown) => fakeChain) as unknown as typeof Transaction.find);
  patch(Transaction, "countDocuments", (async (_filter: unknown) => 1) as unknown as typeof Transaction.countDocuments);

  const { transactions, total } = await mongoTransactionRepository.listForOwner({
    ownerId: OWNER_OID,
    page: 1,
    limit: 10
  });

  expect(total).toBe(1);
  expect(transactions.length).toBe(1);
  expect(transactions[0].id).toBe(leanTx._id);
  expect((transactions[0] as Record<string, unknown>)._id).toBeUndefined();
});

test("listForOwner: skip is (page-1)*limit", async () => {
  let capturedSkip = -1;
  let capturedLimit = -1;
  const fakeChain = {
    sort: () => fakeChain,
    skip: (n: number) => { capturedSkip = n; return fakeChain; },
    limit: (n: number) => { capturedLimit = n; return fakeChain; },
    lean: async () => []
  };
  patch(Transaction, "find", ((_f: unknown) => fakeChain) as unknown as typeof Transaction.find);
  patch(Transaction, "countDocuments", (async () => 0) as unknown as typeof Transaction.countDocuments);

  await mongoTransactionRepository.listForOwner({ ownerId: OWNER_OID, page: 3, limit: 5 });
  expect(capturedSkip).toBe(10);
  expect(capturedLimit).toBe(5);
});

// ---------------------------------------------------------------------------
// recentWithCounterparty
// ---------------------------------------------------------------------------

test("recentWithCounterparty: returns TransactionRecords sorted desc", async () => {
  let capturedFilter: unknown;
  let capturedLimit = -1;
  let capturedSort: unknown;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    limit: (n: number) => { capturedLimit = n; return fakeChain; },
    lean: async () => [leanTx]
  };
  patch(
    Transaction,
    "find",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof Transaction.find
  );

  const records = await mongoTransactionRepository.recentWithCounterparty({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com",
    limit: 5
  });

  expect(records.length).toBe(1);
  expect(records[0].id).toBe(leanTx._id);
  expect(capturedFilter).toStrictEqual({ ownerId: OWNER_OID, counterpartyEmail: "bob@example.com" });
  expect(capturedSort).toStrictEqual({ createdAt: -1 });
  expect(capturedLimit).toBe(5);
});

// ---------------------------------------------------------------------------
// getRelationshipStats
// ---------------------------------------------------------------------------

test("getRelationshipStats: $match uses Types.ObjectId for ownerId", async () => {
  let capturedPipeline: unknown[] = [];
  patch(
    Transaction,
    "aggregate",
    (async (pipeline: unknown[]) => { capturedPipeline = pipeline; return []; }) as unknown as typeof Transaction.aggregate
  );

  await mongoTransactionRepository.getRelationshipStats({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  const match = (capturedPipeline[0] as { $match: Record<string, unknown> }).$match;
  // The ObjectId cast must live in the repo, not in the consumer
  expect(match.ownerId).toBeInstanceOf(Types.ObjectId);
  expect(String(match.ownerId)).toBe(OWNER_OID);
  expect(match.counterpartyEmail).toBe("bob@example.com");
});

test("getRelationshipStats: returns correct fields from aggregate result", async () => {
  patch(
    Transaction,
    "aggregate",
    (async () => [{
      totalSent: 500,
      totalReceived: 200.5,
      transactionCount: 7,
      lastTransactionAt: new Date("2026-06-10T08:00:00.000Z")
    }]) as unknown as typeof Transaction.aggregate
  );

  const result = await mongoTransactionRepository.getRelationshipStats({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  expect(result.totalSent).toBe(500);
  expect(result.totalReceived).toBe(200.5);
  expect(result.transactionCount).toBe(7);
  expect(result.lastTransactionAt).toStrictEqual(new Date("2026-06-10T08:00:00.000Z"));
});

test("getRelationshipStats: returns zero-defaults when aggregate is empty", async () => {
  patch(Transaction, "aggregate", (async () => []) as unknown as typeof Transaction.aggregate);

  const result = await mongoTransactionRepository.getRelationshipStats({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  expect(result.totalSent).toBe(0);
  expect(result.totalReceived).toBe(0);
  expect(result.transactionCount).toBe(0);
  expect(result.lastTransactionAt).toBeNull();
});

// ---------------------------------------------------------------------------
// getDirectionalTotals
// ---------------------------------------------------------------------------

test("getDirectionalTotals: $match uses Types.ObjectId for ownerId", async () => {
  let capturedPipeline: unknown[] = [];
  patch(
    Transaction,
    "aggregate",
    (async (pipeline: unknown[]) => { capturedPipeline = pipeline; return []; }) as unknown as typeof Transaction.aggregate
  );

  await mongoTransactionRepository.getDirectionalTotals({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  const match = (capturedPipeline[0] as { $match: Record<string, unknown> }).$match;
  expect(match.ownerId).toBeInstanceOf(Types.ObjectId);
  expect(String(match.ownerId)).toBe(OWNER_OID);
});

test("getDirectionalTotals: returns credit/debit totals and counts", async () => {
  patch(
    Transaction,
    "aggregate",
    (async () => [
      { _id: "credit", total: 300, count: 3 },
      { _id: "debit", total: 150, count: 2 }
    ]) as unknown as typeof Transaction.aggregate
  );

  const result = await mongoTransactionRepository.getDirectionalTotals({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  expect(result.creditTotal).toBe(300);
  expect(result.creditCount).toBe(3);
  expect(result.debitTotal).toBe(150);
  expect(result.debitCount).toBe(2);
});

test("getDirectionalTotals: returns zeros when aggregate is empty", async () => {
  patch(Transaction, "aggregate", (async () => []) as unknown as typeof Transaction.aggregate);

  const result = await mongoTransactionRepository.getDirectionalTotals({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  expect(result.creditTotal).toBe(0);
  expect(result.creditCount).toBe(0);
  expect(result.debitTotal).toBe(0);
  expect(result.debitCount).toBe(0);
});
