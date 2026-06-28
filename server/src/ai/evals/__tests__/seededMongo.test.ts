/**
 * Unit tests for evals/seededMongo.ts — buildSeededMongoEvalSeedData only.
 *
 * This is the one pure-data function in the file (no Mongo, no network).
 * All other exports require a live MongoDB connection and are skipped.
 */
import { buildSeededMongoEvalSeedData } from "../seededMongo.js";

describe("buildSeededMongoEvalSeedData", () => {
  it("returns the expected number of seed users (5)", () => {
    const data = buildSeededMongoEvalSeedData();
    expect(data.users).toHaveLength(5);
  });

  it("includes the eval-owner user as the first user", () => {
    const data = buildSeededMongoEvalSeedData();
    expect(data.users[0]?.email).toBe("ai-eval-owner@example.com");
  });

  it("includes counterparty users with distinct emails", () => {
    const data = buildSeededMongoEvalSeedData();
    const emails = data.users.map((u) => u.email);
    expect(emails).toContain("alex@example.com");
    expect(emails).toContain("daniel@example.com");
    expect(emails).toContain("sarah@example.com");
    expect(emails).toContain("rani@example.com");
  });

  it("all users have a positive balance", () => {
    const data = buildSeededMongoEvalSeedData();
    for (const user of data.users) {
      expect(user.balance).toBeGreaterThan(0);
    }
  });

  it("returns 4 personal details entries (one per counterparty)", () => {
    const data = buildSeededMongoEvalSeedData();
    expect(data.personalDetails).toHaveLength(4);
  });

  it("includes the expected personal details first names", () => {
    const data = buildSeededMongoEvalSeedData();
    const firstNames = data.personalDetails.map((pd) => pd.firstName);
    expect(firstNames).toContain("Alex");
    expect(firstNames).toContain("Daniel");
    expect(firstNames).toContain("Sarah");
    expect(firstNames).toContain("Rani");
  });

  it("all personal details have lastName 'Example'", () => {
    const data = buildSeededMongoEvalSeedData();
    for (const pd of data.personalDetails) {
      expect(pd.lastName).toBe("Example");
    }
  });

  it("returns at least 10 transaction entries", () => {
    const data = buildSeededMongoEvalSeedData();
    expect(data.transactions.length).toBeGreaterThanOrEqual(10);
  });

  it("all transactions have a positive amount", () => {
    const data = buildSeededMongoEvalSeedData();
    for (const tx of data.transactions) {
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

  it("all transactions have type 'credit' or 'debit'", () => {
    const data = buildSeededMongoEvalSeedData();
    for (const tx of data.transactions) {
      expect(["credit", "debit"]).toContain(tx.type);
    }
  });

  it("directionLabel matches type (credit -> received, debit -> sent)", () => {
    const data = buildSeededMongoEvalSeedData();
    for (const tx of data.transactions) {
      if (tx.type === "credit") {
        expect(tx.directionLabel).toBe("received");
      } else {
        expect(tx.directionLabel).toBe("sent");
      }
    }
  });

  it("all transactions have an ownerId referencing the eval-owner user", () => {
    const data = buildSeededMongoEvalSeedData();
    const ownerIdStr = data.users[0]?._id.toString();
    for (const tx of data.transactions) {
      expect(tx.ownerId.toString()).toBe(ownerIdStr);
    }
  });

  it("all transactions have a counterpartyEmail that is one of the seeded users", () => {
    const data = buildSeededMongoEvalSeedData();
    const counterpartyEmails = data.users.slice(1).map((u) => u.email);
    for (const tx of data.transactions) {
      expect(counterpartyEmails).toContain(tx.counterpartyEmail);
    }
  });

  it("transactions include createdAt Date instances", () => {
    const data = buildSeededMongoEvalSeedData();
    for (const tx of data.transactions) {
      expect(tx.createdAt).toBeInstanceOf(Date);
    }
  });

  it("is idempotent — calling it twice produces the same user emails", () => {
    const a = buildSeededMongoEvalSeedData();
    const b = buildSeededMongoEvalSeedData();
    expect(a.users.map((u) => u.email)).toEqual(b.users.map((u) => u.email));
  });

  it("personalDetails userId corresponds to a user _id in the users array", () => {
    const data = buildSeededMongoEvalSeedData();
    const userIdStrs = data.users.map((u) => u._id.toString());
    for (const pd of data.personalDetails) {
      expect(userIdStrs).toContain(pd.userId.toString());
    }
  });
});
