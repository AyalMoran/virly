// src/repositories/mongo/verificationToken.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { toVerificationTokenRecord } from "../verificationToken.repository.js";

test("maps a Mongo doc to a plain VerificationTokenRecord", () => {
  const now = new Date();
  const rec = toVerificationTokenRecord({
    _id: { toString: () => "abc" },
    userId: { toString: () => "u1" },
    tokenHash: "h",
    expiresAt: now,
    createdAt: now,
    updatedAt: now
  });
  assert.equal(rec.id, "abc");
  assert.equal(rec.userId, "u1");
  assert.equal(rec.tokenHash, "h");
});
