// src/transactionQuery.service.test.ts

import assert from "node:assert/strict";
import test from "node:test";
import { setRepositories, getRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { transactionQueryService } from "../transactionQuery.service.js";
import type { TransactionRecord } from "../../repositories/types.js";

const OWNER_OID = "507f1f77bcf86cd799439011";

function makeRecord(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: "60d5ec49f1b2c8a1f8e4e1b1",
    ownerId: OWNER_OID,
    counterpartyEmail: "bob@example.com",
    amount: 100,
    type: "debit",
    directionLabel: "Sent",
    reason: null,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
    ...overrides
  };
}

function withRepoMock(
  overrides: Partial<ReturnType<typeof createMongoRepositories>["transactions"]>,
  fn: () => Promise<void>
): () => Promise<void> {
  return async () => {
    const base = createMongoRepositories();
    setRepositories({
      ...base,
      transactions: {
        ...base.transactions,
        ...overrides
      }
    });
    try {
      await fn();
    } finally {
      // restore base so other tests aren't affected
      setRepositories(base);
    }
  };
}

// ---------------------------------------------------------------------------
// listForOwner
// ---------------------------------------------------------------------------

test("listForOwner: ownerId scoping is always applied", withRepoMock(
  {
    listForOwner: async (input) => {
      assert.equal(input.ownerId, "owner-123");
      return { transactions: [], total: 0 };
    }
  },
  async () => {
    await transactionQueryService.listForOwner({ ownerId: "owner-123", page: 1, limit: 10 });
  }
));

test("listForOwner: counterpartyEmail filter forwarded when provided", withRepoMock(
  {
    listForOwner: async (input) => {
      assert.equal(input.counterpartyEmail, "alice@example.com");
      return { transactions: [], total: 0 };
    }
  },
  async () => {
    await transactionQueryService.listForOwner({
      ownerId: "owner-123",
      counterpartyEmail: "alice@example.com",
      page: 1,
      limit: 10
    });
  }
));

test("listForOwner: no counterpartyEmail when not provided", withRepoMock(
  {
    listForOwner: async (input) => {
      assert.equal(Object.hasOwn(input, "counterpartyEmail") && input.counterpartyEmail !== undefined, false);
      return { transactions: [], total: 0 };
    }
  },
  async () => {
    await transactionQueryService.listForOwner({ ownerId: "owner-123", page: 1, limit: 10 });
  }
));

test("listForOwner: page and limit forwarded correctly", withRepoMock(
  {
    listForOwner: async (input) => {
      assert.equal(input.page, 3);
      assert.equal(input.limit, 5);
      return { transactions: [], total: 0 };
    }
  },
  async () => {
    await transactionQueryService.listForOwner({ ownerId: "owner-123", page: 3, limit: 5 });
  }
));

test("listForOwner: returns transactions and total from repo", withRepoMock(
  {
    listForOwner: async () => ({
      transactions: [makeRecord(), makeRecord({ id: "tx-2" })],
      total: 42
    })
  },
  async () => {
    const result = await transactionQueryService.listForOwner({
      ownerId: "owner-123", page: 1, limit: 10
    });
    assert.equal(result.total, 42);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].id, "60d5ec49f1b2c8a1f8e4e1b1");
  }
));

// ---------------------------------------------------------------------------
// getRelationshipStats
// ---------------------------------------------------------------------------

test("getRelationshipStats: forwards ownerId and counterpartyEmail to repo", withRepoMock(
  {
    getRelationshipStats: async (input) => {
      // The service no longer does ObjectId casting — that's in the repo.
      // Verify the string is passed through unchanged.
      assert.equal(input.ownerId, OWNER_OID);
      assert.equal(input.counterpartyEmail, "bob@example.com");
      return { totalSent: 0, totalReceived: 0, transactionCount: 0, lastTransactionAt: null };
    }
  },
  async () => {
    await transactionQueryService.getRelationshipStats({
      ownerId: OWNER_OID,
      counterpartyEmail: "bob@example.com"
    });
  }
));

test("getRelationshipStats: returns correct totals for known fixture", withRepoMock(
  {
    getRelationshipStats: async () => ({
      totalSent: 500,
      totalReceived: 200.5,
      transactionCount: 7,
      lastTransactionAt: new Date("2026-06-10T08:00:00.000Z")
    })
  },
  async () => {
    const result = await transactionQueryService.getRelationshipStats({
      ownerId: OWNER_OID,
      counterpartyEmail: "bob@example.com"
    });
    assert.equal(result.totalSent, 500);
    assert.equal(result.totalReceived, 200.5);
    assert.equal(result.transactionCount, 7);
    assert.deepEqual(result.lastTransactionAt, new Date("2026-06-10T08:00:00.000Z"));
  }
));

test("getRelationshipStats: returns zero-defaults when repo returns zeros", withRepoMock(
  {
    getRelationshipStats: async () => ({
      totalSent: 0,
      totalReceived: 0,
      transactionCount: 0,
      lastTransactionAt: null
    })
  },
  async () => {
    const result = await transactionQueryService.getRelationshipStats({
      ownerId: OWNER_OID,
      counterpartyEmail: "bob@example.com"
    });
    assert.equal(result.totalSent, 0);
    assert.equal(result.totalReceived, 0);
    assert.equal(result.transactionCount, 0);
    assert.equal(result.lastTransactionAt, null);
  }
));

// ---------------------------------------------------------------------------
// recentWithCounterparty
// ---------------------------------------------------------------------------

test("recentWithCounterparty: forwards ownerId and counterpartyEmail to repo", withRepoMock(
  {
    recentWithCounterparty: async (input) => {
      assert.equal(input.ownerId, "owner-xyz");
      assert.equal(input.counterpartyEmail, "carol@example.com");
      return [];
    }
  },
  async () => {
    await transactionQueryService.recentWithCounterparty({
      ownerId: "owner-xyz",
      counterpartyEmail: "carol@example.com",
      limit: 5
    });
  }
));

test("recentWithCounterparty: forwards limit to repo", withRepoMock(
  {
    recentWithCounterparty: async (input) => {
      assert.equal(input.limit, 5);
      return [];
    }
  },
  async () => {
    await transactionQueryService.recentWithCounterparty({
      ownerId: "owner-xyz",
      counterpartyEmail: "carol@example.com",
      limit: 5
    });
  }
));

test("recentWithCounterparty: returns the records from repo", withRepoMock(
  {
    recentWithCounterparty: async () => [makeRecord({ id: "tx-9" })]
  },
  async () => {
    const result = await transactionQueryService.recentWithCounterparty({
      ownerId: "owner-xyz",
      counterpartyEmail: "carol@example.com",
      limit: 5
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "tx-9");
  }
));
