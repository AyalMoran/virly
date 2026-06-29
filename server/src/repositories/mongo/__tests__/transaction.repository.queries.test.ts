
// src/repositories/mongo/transaction.repository.queries.test.ts
// Tests: getDailyDebitUsage, findByIdForOwner, listForOwnerFiltered, recentForOwner,
//         lastForOwner, hasDebitToCounterparty
import { Transaction } from "../../../models/Transaction.js";
import { mongoTransactionRepository } from "../transaction.repository.js";
import { cleanups, patch, OWNER_OID, leanTx } from "./_transactionKit.js";

afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

// ---------------------------------------------------------------------------
// getDailyDebitUsage
// ---------------------------------------------------------------------------

test("getDailyDebitUsage: returns sum and count of debits in window", async () => {
  let capturedFilter: unknown;
  const fakeChain = {
    select: () => fakeChain,
    session: () => fakeChain,
    lean: async () => [{ amount: 100 }, { amount: 50.5 }, { amount: 9.5 }]
  };
  patch(
    Transaction,
    "find",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof Transaction.find
  );

  const result = await mongoTransactionRepository.getDailyDebitUsage({
    ownerId: OWNER_OID,
    dayStart: new Date("2026-06-22T00:00:00.000Z"),
    dayEnd: new Date("2026-06-23T00:00:00.000Z")
  });

  expect(result.total).toBe(160);
  expect(result.count).toBe(3);
  const filter = capturedFilter as Record<string, unknown>;
  expect(filter.ownerId).toBe(OWNER_OID);
  expect(filter.type).toBe("debit");
});

test("getDailyDebitUsage: returns zeros when no debits found", async () => {
  const fakeChain = {
    select: () => fakeChain,
    session: () => fakeChain,
    lean: async () => []
  };
  patch(Transaction, "find", ((_f: unknown) => fakeChain) as unknown as typeof Transaction.find);

  const result = await mongoTransactionRepository.getDailyDebitUsage({
    ownerId: OWNER_OID,
    dayStart: new Date("2026-06-22T00:00:00.000Z"),
    dayEnd: new Date("2026-06-23T00:00:00.000Z")
  });

  expect(result.total).toBe(0);
  expect(result.count).toBe(0);
});

// ---------------------------------------------------------------------------
// findByIdForOwner
// ---------------------------------------------------------------------------

test("findByIdForOwner: returns a record scoped by _id and ownerId", async () => {
  let capturedFilter: unknown;
  const fakeChain = { session: () => fakeChain, lean: async () => leanTx };
  patch(
    Transaction,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof Transaction.findOne
  );

  const record = await mongoTransactionRepository.findByIdForOwner(
    "60d5ec49f1b2c8a1f8e4e1b1",
    OWNER_OID
  );

  expect(record).toBeTruthy();
  expect(record?.id).toBe(leanTx._id);
  expect((record as Record<string, unknown>)._id).toBeUndefined();
  expect(capturedFilter).toStrictEqual({ _id: "60d5ec49f1b2c8a1f8e4e1b1", ownerId: OWNER_OID });
});

test("findByIdForOwner: returns null for a malformed (non-ObjectId) id without querying", async () => {
  let queried = false;
  patch(
    Transaction,
    "findOne",
    ((_filter: unknown) => { queried = true; return { lean: async () => null }; }) as unknown as typeof Transaction.findOne
  );

  const record = await mongoTransactionRepository.findByIdForOwner("not-an-objectid", OWNER_OID);

  expect(record).toBeNull();
  expect(queried).toBe(false);
});

test("findByIdForOwner: returns null when no document matches", async () => {
  const fakeChain = { session: () => fakeChain, lean: async () => null };
  patch(
    Transaction,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof Transaction.findOne
  );

  const record = await mongoTransactionRepository.findByIdForOwner(
    "60d5ec49f1b2c8a1f8e4e1b1",
    OWNER_OID
  );

  expect(record).toBeNull();
});

// ---------------------------------------------------------------------------
// listForOwnerFiltered
// ---------------------------------------------------------------------------

test("listForOwnerFiltered: builds filter from plain criteria and maps records", async () => {
  let capturedFilter: Record<string, unknown> = {};
  let capturedSort: unknown;
  let capturedLimit = -1;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    limit: (n: number) => { capturedLimit = n; return fakeChain; },
    lean: async () => [leanTx]
  };
  patch(
    Transaction,
    "find",
    ((filter: Record<string, unknown>) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof Transaction.find
  );

  const records = await mongoTransactionRepository.listForOwnerFiltered({
    ownerId: OWNER_OID,
    type: "debit",
    counterpartyEmail: "bob@example.com",
    dateFrom: new Date("2026-06-01T00:00:00.000Z"),
    dateTo: new Date("2026-06-30T00:00:00.000Z"),
    minAmount: 10,
    maxAmount: 500,
    reasonContains: "lunch",
    sort: "amount_desc",
    limit: 25
  });

  expect(records.length).toBe(1);
  expect(records[0].id).toBe(leanTx._id);
  expect(capturedFilter.ownerId).toBe(OWNER_OID);
  expect(capturedFilter.type).toBe("debit");
  expect(capturedFilter.counterpartyEmail).toBe("bob@example.com");
  expect(capturedFilter.amount).toStrictEqual({ $gte: 10, $lte: 500 });
  expect(capturedFilter.createdAt).toBeTruthy();
  expect(capturedFilter.reason).toBeInstanceOf(RegExp);
  expect(capturedSort).toStrictEqual({ amount: -1 });
  expect(capturedLimit).toBe(25);
});

test("listForOwnerFiltered: omits optional clauses and defaults sort to newest", async () => {
  let capturedFilter: Record<string, unknown> = {};
  let capturedSort: unknown;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    limit: () => fakeChain,
    lean: async () => []
  };
  patch(
    Transaction,
    "find",
    ((filter: Record<string, unknown>) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof Transaction.find
  );

  await mongoTransactionRepository.listForOwnerFiltered({ ownerId: OWNER_OID, limit: 10 });

  expect(capturedFilter).toStrictEqual({ ownerId: OWNER_OID });
  expect(capturedSort).toStrictEqual({ createdAt: -1 });
});

// ---------------------------------------------------------------------------
// recentForOwner / lastForOwner
// ---------------------------------------------------------------------------

test("recentForOwner: sorts newest-first, applies type and date window", async () => {
  let capturedFilter: Record<string, unknown> = {};
  let capturedSort: unknown;
  let capturedLimit = -1;
  const fakeChain = {
    sort: (s: unknown) => { capturedSort = s; return fakeChain; },
    limit: (n: number) => { capturedLimit = n; return fakeChain; },
    lean: async () => [leanTx]
  };
  patch(
    Transaction,
    "find",
    ((filter: Record<string, unknown>) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof Transaction.find
  );

  const records = await mongoTransactionRepository.recentForOwner({
    ownerId: OWNER_OID,
    type: "credit",
    dateFrom: new Date("2026-06-01T00:00:00.000Z"),
    limit: 5
  });

  expect(records.length).toBe(1);
  expect(records[0].id).toBe(leanTx._id);
  expect(capturedFilter.ownerId).toBe(OWNER_OID);
  expect(capturedFilter.type).toBe("credit");
  expect(capturedFilter.createdAt).toBeTruthy();
  expect(capturedSort).toStrictEqual({ createdAt: -1 });
  expect(capturedLimit).toBe(5);
});

test("lastForOwner: returns the single newest matching record", async () => {
  let capturedLimit = -1;
  const fakeChain = {
    sort: () => fakeChain,
    limit: (n: number) => { capturedLimit = n; return fakeChain; },
    lean: async () => [leanTx]
  };
  patch(Transaction, "find", ((_f: unknown) => fakeChain) as unknown as typeof Transaction.find);

  const record = await mongoTransactionRepository.lastForOwner({ ownerId: OWNER_OID, type: "debit" });

  expect(record).toBeTruthy();
  expect(record?.id).toBe(leanTx._id);
  expect(capturedLimit).toBe(1);
});

test("lastForOwner: returns null when nothing matches", async () => {
  const fakeChain = {
    sort: () => fakeChain,
    limit: () => fakeChain,
    lean: async () => []
  };
  patch(Transaction, "find", ((_f: unknown) => fakeChain) as unknown as typeof Transaction.find);

  const record = await mongoTransactionRepository.lastForOwner({ ownerId: OWNER_OID, type: "debit" });

  expect(record).toBeNull();
});

// ---------------------------------------------------------------------------
// hasDebitToCounterparty
// ---------------------------------------------------------------------------

test("hasDebitToCounterparty: true when a debit exists", async () => {
  let capturedFilter: unknown;
  patch(
    Transaction,
    "exists",
    (((filter: unknown) => { capturedFilter = filter; return Promise.resolve({ _id: "x" }); }) as unknown) as typeof Transaction.exists
  );

  const result = await mongoTransactionRepository.hasDebitToCounterparty({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  expect(result).toBe(true);
  expect(capturedFilter).toStrictEqual({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com",
    type: "debit"
  });
});

test("hasDebitToCounterparty: false when no debit exists", async () => {
  patch(
    Transaction,
    "exists",
    (((_filter: unknown) => Promise.resolve(null)) as unknown) as typeof Transaction.exists
  );

  const result = await mongoTransactionRepository.hasDebitToCounterparty({
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com"
  });

  expect(result).toBe(false);
});
