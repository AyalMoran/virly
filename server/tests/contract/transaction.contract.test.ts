// server/tests/contract/transaction.contract.test.ts
import assert from "node:assert/strict";
import { describeContract } from "./harness.js";

// Valid 24-char hex ObjectId-like strings — distinct per test case
// Using only 0-9 and a-f characters
const OWNER: Record<string, string> = {
  A: "aaaaaaaaaaaaaaaaaaaaaaaa", // test 1: getRelationshipStats empty
  B: "bbbbbbbbbbbbbbbbbbbbbbbb", // test 2: getRelationshipStats with data
  C: "cccccccccccccccccccccccc", // test 3: getDirectionalTotals
  D: "dddddddddddddddddddddddd", // test 4: getDailyDebitUsage
  E: "eeeeeeeeeeeeeeeeeeeeeeee", // test 5: listForOwner
  F: "ffffffffffffffffffffffff", // test 6: listForOwnerFiltered reasonContains
  G: "0000000000000000000000aa", // test 7: listForOwnerFiltered dateFrom/dateTo
  H: "0000000000000000000000ab", // test 8: listForOwnerFiltered sort orders
  I: "0000000000000000000000ac", // test 9: recentForOwner
  J: "0000000000000000000000ad", // test 10: lastForOwner
  K: "0000000000000000000000ae", // test 11: recentWithCounterparty
  L: "0000000000000000000000af", // test 12: hasDebitToCounterparty
  M: "0000000000000000000000ba", // test 13: findByIdForOwner
  N: "0000000000000000000000bb", // foreign owner for test 13
  O: "0000000000000000000000bc"  // test 14: createMany order preservation
};

describeContract("TransactionRepository", {
  "getRelationshipStats returns zero-defaults when no transactions exist": async ({ repos }) => {
    const ownerId = OWNER["A"];
    const stats = await repos.transactions.getRelationshipStats({ ownerId, counterpartyEmail: "nobody@example.com" });
    assert.equal(stats.totalSent, 0);
    assert.equal(stats.totalReceived, 0);
    assert.equal(stats.transactionCount, 0);
    assert.equal(stats.lastTransactionAt, null);
  },

  "getRelationshipStats returns correct totals and lastTransactionAt with seeded data": async ({ repos }) => {
    const ownerId = OWNER["B"];
    const cpEmail = "cp@example.com";

    // Two debits (sent) + one credit (received)
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: cpEmail, amount: 50, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: cpEmail, amount: 30, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: cpEmail, amount: 20, type: "credit", directionLabel: "received", reason: null }
    ]);

    const stats = await repos.transactions.getRelationshipStats({ ownerId, counterpartyEmail: cpEmail });
    assert.equal(stats.totalSent, 80);
    assert.equal(stats.totalReceived, 20);
    assert.equal(stats.transactionCount, 3);
    assert.ok(stats.lastTransactionAt instanceof Date, `lastTransactionAt should be a Date, got: ${typeof stats.lastTransactionAt} ${String(stats.lastTransactionAt)}`);
  },

  "getDirectionalTotals returns correct credit and debit math": async ({ repos }) => {
    const ownerId = OWNER["C"];
    // All transactions with the same counterpartyEmail to test directional totals
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 10, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 20, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 5, type: "credit", directionLabel: "received", reason: null },
      // This one with a different counterparty should NOT be counted
      { ownerId, counterpartyEmail: "b@x.com", amount: 999, type: "debit", directionLabel: "sent", reason: null }
    ]);

    const totals = await repos.transactions.getDirectionalTotals({ ownerId, counterpartyEmail: "a@x.com" });
    assert.equal(totals.debitTotal, 30);
    assert.equal(totals.debitCount, 2);
    assert.equal(totals.creditTotal, 5);
    assert.equal(totals.creditCount, 1);
  },

  "getDailyDebitUsage counts only debits within the window (exclusive end)": async ({ repos }) => {
    const ownerId = OWNER["D"];
    // Seed debits + credit at "current" time, then test with a future window (excludes them)
    // and a window that includes now
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "x@x.com", amount: 40, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "x@x.com", amount: 99, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "x@x.com", amount: 10, type: "credit", directionLabel: "received", reason: null }
    ]);

    // Window in the past → no results
    const pastStart = new Date("2024-06-01T00:00:00Z");
    const pastEnd = new Date("2024-06-02T00:00:00Z");
    const usagePast = await repos.transactions.getDailyDebitUsage({
      ownerId, dayStart: pastStart, dayEnd: pastEnd
    });
    assert.equal(usagePast.total, 0);
    assert.equal(usagePast.count, 0);

    // Window covering now → should count the 2 debits (not the credit)
    const now = new Date();
    const usageNow = await repos.transactions.getDailyDebitUsage({
      ownerId,
      dayStart: new Date(now.getTime() - 5000), // 5s before seeding
      dayEnd: new Date(now.getTime() + 60000)   // 1 min future
    });
    assert.equal(usageNow.count, 2);
    assert.equal(usageNow.total, 139);
  },

  "listForOwner paginates and returns correct total": async ({ repos }) => {
    const ownerId = OWNER["E"];
    const created = await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 1, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "b@x.com", amount: 2, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "c@x.com", amount: 3, type: "credit", directionLabel: "received", reason: null }
    ]);
    assert.equal(created.length, 3, `createMany should return 3 rows, got ${created.length}`);

    const page1 = await repos.transactions.listForOwner({ ownerId, page: 1, limit: 2 });
    assert.equal(page1.total, 3, `total should be 3 but got ${page1.total}; page1 has ${page1.transactions.length} rows`);
    assert.equal(page1.transactions.length, 2);

    const page2 = await repos.transactions.listForOwner({ ownerId, page: 2, limit: 2 });
    assert.equal(page2.total, 3);
    assert.equal(page2.transactions.length, 1);

    // All pages together should contain all 3 rows
    const allAmounts = [...page1.transactions, ...page2.transactions].map(r => r.amount).sort((a, b) => a - b);
    assert.deepEqual(allAmounts, [1, 2, 3]);

    // All results are for this owner
    assert.ok(page1.transactions.every(r => r.ownerId === ownerId));
    assert.ok(page2.transactions.every(r => r.ownerId === ownerId));
  },

  "listForOwnerFiltered reasonContains is case-insensitive": async ({ repos }) => {
    const ownerId = OWNER["F"];
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 10, type: "debit", directionLabel: "sent", reason: "Hello World" },
      { ownerId, counterpartyEmail: "a@x.com", amount: 20, type: "debit", directionLabel: "sent", reason: "Goodbye" }
    ]);

    const results = await repos.transactions.listForOwnerFiltered({
      ownerId,
      reasonContains: "hello",
      limit: 10
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].reason, "Hello World");
  },

  "listForOwnerFiltered dateFrom is inclusive, dateTo is exclusive": async ({ repos }) => {
    const ownerId = OWNER["G"];
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 10, type: "debit", directionLabel: "sent", reason: "boundary-test" }
    ]);

    const now = new Date();
    const past = new Date(now.getTime() - 10000);  // 10s ago
    const future = new Date(now.getTime() + 60000); // 1 min future

    // dateFrom=past (inclusive) → should include the record (created at ~now > past)
    const withFrom = await repos.transactions.listForOwnerFiltered({
      ownerId,
      dateFrom: past,
      limit: 10
    });
    assert.equal(withFrom.length, 1);

    // dateTo=far future → should include
    const withFutureTo = await repos.transactions.listForOwnerFiltered({
      ownerId,
      dateTo: future,
      limit: 10
    });
    assert.equal(withFutureTo.length, 1);

    // dateTo=past (exclusive) → record created at ~now >= past, so excluded
    const withPastTo = await repos.transactions.listForOwnerFiltered({
      ownerId,
      dateTo: past,
      limit: 10
    });
    assert.equal(withPastTo.length, 0);
  },

  "listForOwnerFiltered sort orders return records in correct order": async ({ repos }) => {
    const ownerId = OWNER["H"];
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 5, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 15, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 10, type: "debit", directionLabel: "sent", reason: null }
    ]);

    // amount_desc and amount_asc are deterministic
    const amountDesc = await repos.transactions.listForOwnerFiltered({ ownerId, sort: "amount_desc", limit: 10 });
    assert.equal(amountDesc.length, 3);
    assert.equal(amountDesc[0].amount, 15);
    assert.equal(amountDesc[1].amount, 10);
    assert.equal(amountDesc[2].amount, 5);

    const amountAsc = await repos.transactions.listForOwnerFiltered({ ownerId, sort: "amount_asc", limit: 10 });
    assert.equal(amountAsc[0].amount, 5);
    assert.equal(amountAsc[1].amount, 10);
    assert.equal(amountAsc[2].amount, 15);

    // newest/oldest: createMany inserts at the same time, but createdAt ordering should be consistent
    const newest = await repos.transactions.listForOwnerFiltered({ ownerId, sort: "newest", limit: 10 });
    const oldest = await repos.transactions.listForOwnerFiltered({ ownerId, sort: "oldest", limit: 10 });
    assert.equal(newest.length, 3);
    assert.equal(oldest.length, 3);
    // newest[0] should have createdAt >= newest[2]
    assert.ok(newest[0].createdAt >= newest[2].createdAt);
    // oldest[0] should have createdAt <= oldest[2].createdAt
    assert.ok(oldest[0].createdAt <= oldest[2].createdAt);
    // newest and oldest should be reverse of each other (for same timestamps, both orderings work)
    // Just verify they have the same set of records
    const newestIds = new Set(newest.map(r => r.id));
    const oldestIds = new Set(oldest.map(r => r.id));
    assert.equal(newestIds.size, 3);
    for (const id of oldestIds) assert.ok(newestIds.has(id));
  },

  "recentForOwner returns newest-first limited by limit": async ({ repos }) => {
    const ownerId = OWNER["I"];
    // Insert with explicit sequential amounts so we can identify them
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 1, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 2, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 3, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 4, type: "debit", directionLabel: "sent", reason: null }
    ]);

    const recent = await repos.transactions.recentForOwner({ ownerId, limit: 2 });
    assert.equal(recent.length, 2);
    // Verify limit works
    const all = await repos.transactions.recentForOwner({ ownerId, limit: 100 });
    assert.equal(all.length, 4);
    // Newest-first: createdAt of first >= createdAt of last
    assert.ok(recent[0].createdAt >= recent[1].createdAt);
  },

  "lastForOwner returns single most recent record or null on empty": async ({ repos }) => {
    const ownerId = OWNER["J"];

    // Empty → null
    const empty = await repos.transactions.lastForOwner({ ownerId });
    assert.equal(empty, null);

    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 7, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "a@x.com", amount: 9, type: "debit", directionLabel: "sent", reason: null }
    ]);

    const last = await repos.transactions.lastForOwner({ ownerId });
    assert.ok(last !== null);
    // Must be a single record
    assert.ok(last!.id.length === 24);
    // Must be the most recent (newest-first limit 1)
    const allRecent = await repos.transactions.recentForOwner({ ownerId, limit: 100 });
    assert.equal(last!.id, allRecent[0].id);
  },

  "recentWithCounterparty filters by counterpartyEmail": async ({ repos }) => {
    const ownerId = OWNER["K"];
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "alice@x.com", amount: 10, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "bob@x.com", amount: 20, type: "debit", directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "alice@x.com", amount: 30, type: "credit", directionLabel: "received", reason: null }
    ]);

    const results = await repos.transactions.recentWithCounterparty({ ownerId, counterpartyEmail: "alice@x.com", limit: 10 });
    assert.equal(results.length, 2);
    // All results are for alice
    assert.ok(results.every(r => r.counterpartyEmail === "alice@x.com"));
    // Newest first
    assert.ok(results[0].createdAt >= results[1].createdAt);
  },

  "hasDebitToCounterparty returns true for debit, false for credit-only or empty": async ({ repos }) => {
    const ownerId = OWNER["L"];

    // Empty → false
    const noTx = await repos.transactions.hasDebitToCounterparty({ ownerId, counterpartyEmail: "x@x.com" });
    assert.equal(noTx, false);

    // Credit only → false
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "x@x.com", amount: 10, type: "credit", directionLabel: "received", reason: null }
    ]);
    const creditOnly = await repos.transactions.hasDebitToCounterparty({ ownerId, counterpartyEmail: "x@x.com" });
    assert.equal(creditOnly, false);

    // Add debit → true
    await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "x@x.com", amount: 5, type: "debit", directionLabel: "sent", reason: null }
    ]);
    const withDebit = await repos.transactions.hasDebitToCounterparty({ ownerId, counterpartyEmail: "x@x.com" });
    assert.equal(withDebit, true);
  },

  "findByIdForOwner returns null for malformed id, null for foreign owner, record for valid": async ({ repos }) => {
    const ownerId = OWNER["M"];
    const [tx] = await repos.transactions.createMany([
      { ownerId, counterpartyEmail: "a@x.com", amount: 42, type: "debit", directionLabel: "sent", reason: null }
    ]);

    // Malformed id
    const malformed = await repos.transactions.findByIdForOwner("not-a-hex-id", ownerId);
    assert.equal(malformed, null);

    // Foreign owner
    const foreignOwner = OWNER["N"];
    const notFound = await repos.transactions.findByIdForOwner(tx.id, foreignOwner);
    assert.equal(notFound, null);

    // Valid
    const found = await repos.transactions.findByIdForOwner(tx.id, ownerId);
    assert.ok(found !== null);
    assert.equal(found!.amount, 42);
    assert.equal(found!.ownerId, ownerId);
  },

  "createMany preserves input array order in returned records": async ({ repos }) => {
    const ownerId = OWNER["O"];
    const entries = [
      { ownerId, counterpartyEmail: "a@x.com", amount: 111, type: "debit" as const, directionLabel: "sent", reason: null },
      { ownerId, counterpartyEmail: "b@x.com", amount: 222, type: "credit" as const, directionLabel: "received", reason: null },
      { ownerId, counterpartyEmail: "c@x.com", amount: 333, type: "debit" as const, directionLabel: "sent", reason: null }
    ];
    const created = await repos.transactions.createMany(entries);
    assert.equal(created.length, 3);
    assert.equal(created[0].amount, 111);
    assert.equal(created[1].amount, 222);
    assert.equal(created[2].amount, 333);
    // All have 24-hex ids
    for (const r of created) {
      assert.match(r.id, /^[0-9a-fA-F]{24}$/);
    }
  }
});
