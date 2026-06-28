
// src/repositories/postgres/__tests__/index.test.ts
import { createPostgresRepositories } from "../index.js";

describe("createPostgresRepositories", () => {
  describe("happy path — returns all required repository keys", () => {
    it("exposes all 10 domain repositories plus runInTransaction", () => {
      // The postgres repos are static objects; construction does not require a
      // DB connection — driver queries resolve getPgDb() only at call time.
      const repos = createPostgresRepositories();

      const expectedKeys = [
        "users",
        "transactions",
        "personalDetails",
        "exchangeRates",
        "aiConversations",
        "aiPendingTransfers",
        "aiAuditLogs",
        "videoSessions",
        "videoAuditLogs",
        "verificationTokens",
      ];

      for (const key of expectedKeys) {
        expect(repos).toHaveProperty(key);
      }
      expect(typeof repos.runInTransaction).toBe("function");
    });

    it("users repository exposes all required UserRepository methods", () => {
      const { users } = createPostgresRepositories();
      expect(typeof users.findById).toBe("function");
      expect(typeof users.findByIdSafe).toBe("function");
      expect(typeof users.findByEmail).toBe("function");
      expect(typeof users.findByEmails).toBe("function");
      expect(typeof users.findManyByIds).toBe("function");
      expect(typeof users.create).toBe("function");
      expect(typeof users.setBalance).toBe("function");
      expect(typeof users.markVerified).toBe("function");
      expect(typeof users.setPersonalDetails).toBe("function");
    });
  });

  describe("optional _db parameter is accepted but not required", () => {
    it("creates repos without any argument", () => {
      const repos = createPostgresRepositories();
      expect(repos).toBeDefined();
    });

    it("creates repos when passed undefined explicitly", () => {
      const repos = createPostgresRepositories(undefined);
      expect(repos).toBeDefined();
    });
  });

  describe("each invocation returns a fresh object", () => {
    it("two calls return different object references for the wrapper", () => {
      const a = createPostgresRepositories();
      const b = createPostgresRepositories();
      expect(a).not.toBe(b);
    });

    it("but both still expose runInTransaction as a function", () => {
      const a = createPostgresRepositories();
      const b = createPostgresRepositories();
      expect(typeof a.runInTransaction).toBe("function");
      expect(typeof b.runInTransaction).toBe("function");
    });
  });

  describe("individual repository method shapes", () => {
    it("verificationTokens exposes upsertForUser, findByUserId, deleteForUser, deleteExpired", () => {
      const { verificationTokens } = createPostgresRepositories();
      expect(typeof verificationTokens.upsertForUser).toBe("function");
      expect(typeof verificationTokens.findByUserId).toBe("function");
      expect(typeof verificationTokens.deleteForUser).toBe("function");
      expect(typeof verificationTokens.deleteExpired).toBe("function");
    });

    it("videoSessions exposes create, findById, findByRoomName, update, listForUser, listForAgentQueue", () => {
      const { videoSessions } = createPostgresRepositories();
      expect(typeof videoSessions.create).toBe("function");
      expect(typeof videoSessions.findById).toBe("function");
      expect(typeof videoSessions.findByRoomName).toBe("function");
      expect(typeof videoSessions.update).toBe("function");
      expect(typeof videoSessions.listForUser).toBe("function");
      expect(typeof videoSessions.listForAgentQueue).toBe("function");
    });

    it("aiPendingTransfers exposes all required methods", () => {
      const { aiPendingTransfers } = createPostgresRepositories();
      expect(typeof aiPendingTransfers.findById).toBe("function");
      expect(typeof aiPendingTransfers.findActiveForConversation).toBe("function");
      expect(typeof aiPendingTransfers.findActivePendingForUser).toBe("function");
      expect(typeof aiPendingTransfers.listActivePendingForUser).toBe("function");
      expect(typeof aiPendingTransfers.create).toBe("function");
      expect(typeof aiPendingTransfers.updateStatus).toBe("function");
      expect(typeof aiPendingTransfers.setIdempotencyResult).toBe("function");
    });

    it("transactions exposes all required TransactionRepository methods", () => {
      const { transactions } = createPostgresRepositories();
      expect(typeof transactions.createMany).toBe("function");
      expect(typeof transactions.listForOwner).toBe("function");
      expect(typeof transactions.recentWithCounterparty).toBe("function");
      expect(typeof transactions.getRelationshipStats).toBe("function");
      expect(typeof transactions.getDirectionalTotals).toBe("function");
      expect(typeof transactions.getDailyDebitUsage).toBe("function");
      expect(typeof transactions.findByIdForOwner).toBe("function");
      expect(typeof transactions.listForOwnerFiltered).toBe("function");
      expect(typeof transactions.recentForOwner).toBe("function");
      expect(typeof transactions.lastForOwner).toBe("function");
      expect(typeof transactions.hasDebitToCounterparty).toBe("function");
    });
  });
});
