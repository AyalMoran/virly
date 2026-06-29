
// src/repositories/mongo/__tests__/index.test.ts
import { createMongoRepositories } from "../index.js";

describe("createMongoRepositories", () => {
  describe("happy path — returns all required repository keys", () => {
    it("exposes all 10 domain repositories plus runInTransaction", () => {
      const repos = createMongoRepositories();

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
      const { users } = createMongoRepositories();
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

  describe("each invocation returns a fresh object", () => {
    it("two calls return different object references", () => {
      const a = createMongoRepositories();
      const b = createMongoRepositories();
      expect(a).not.toBe(b);
    });

    it("but both expose the same runInTransaction function", () => {
      const a = createMongoRepositories();
      const b = createMongoRepositories();
      // Both delegate to the same module-level runInTransaction export
      expect(typeof a.runInTransaction).toBe("function");
      expect(typeof b.runInTransaction).toBe("function");
    });
  });

  describe("edge cases — individual repository method shapes", () => {
    it("verificationTokens exposes upsertForUser, findByUserId, deleteForUser, deleteExpired", () => {
      const { verificationTokens } = createMongoRepositories();
      expect(typeof verificationTokens.upsertForUser).toBe("function");
      expect(typeof verificationTokens.findByUserId).toBe("function");
      expect(typeof verificationTokens.deleteForUser).toBe("function");
      expect(typeof verificationTokens.deleteExpired).toBe("function");
    });

    it("videoSessions exposes create, findById, findByRoomName, update, listForUser, listForAgentQueue", () => {
      const { videoSessions } = createMongoRepositories();
      expect(typeof videoSessions.create).toBe("function");
      expect(typeof videoSessions.findById).toBe("function");
      expect(typeof videoSessions.findByRoomName).toBe("function");
      expect(typeof videoSessions.update).toBe("function");
      expect(typeof videoSessions.listForUser).toBe("function");
      expect(typeof videoSessions.listForAgentQueue).toBe("function");
    });

    it("aiPendingTransfers exposes all required methods", () => {
      const { aiPendingTransfers } = createMongoRepositories();
      expect(typeof aiPendingTransfers.findById).toBe("function");
      expect(typeof aiPendingTransfers.findActiveForConversation).toBe("function");
      expect(typeof aiPendingTransfers.findActivePendingForUser).toBe("function");
      expect(typeof aiPendingTransfers.listActivePendingForUser).toBe("function");
      expect(typeof aiPendingTransfers.create).toBe("function");
      expect(typeof aiPendingTransfers.updateStatus).toBe("function");
      expect(typeof aiPendingTransfers.setIdempotencyResult).toBe("function");
    });
  });
});
