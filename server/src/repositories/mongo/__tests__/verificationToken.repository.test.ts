// src/repositories/mongo/verificationToken.repository.test.ts
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
  expect(rec.id).toBe("abc");
  expect(rec.userId).toBe("u1");
  expect(rec.tokenHash).toBe("h");
});
