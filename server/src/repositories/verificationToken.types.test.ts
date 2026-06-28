import assert from "node:assert/strict";
import test from "node:test";
import type { VerificationTokenRecord, VerificationTokenRepository } from "./types.js";

test("VerificationTokenRecord and repository shape compile", () => {
  // Compile-time contract: a conforming stub satisfies the interface.
  const rec: VerificationTokenRecord = {
    id: "1", userId: "u1", tokenHash: "h", expiresAt: new Date(),
    createdAt: new Date(), updatedAt: new Date()
  };
  const repo: VerificationTokenRepository = {
    async upsertForUser() { return rec; },
    async findByUserId() { return null; },
    async deleteForUser() {},
    async deleteExpired() { return 0; }
  };
  assert.equal(typeof repo.upsertForUser, "function");
  assert.equal(rec.userId, "u1");
});
