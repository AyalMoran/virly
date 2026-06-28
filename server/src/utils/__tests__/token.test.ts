import crypto from "crypto";
import { hashToken, verificationTokenExpiry } from "../token.js";

describe("hashToken", () => {
  test("produces a 64-char sha256 hex digest", () => {
    const hash = hashToken("my-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("matches a reference sha256 computation", () => {
    const expected = crypto.createHash("sha256").update("abc").digest("hex");
    expect(hashToken("abc")).toBe(expected);
  });

  test("is deterministic and input-sensitive", () => {
    expect(hashToken("same")).toBe(hashToken("same"));
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("verificationTokenExpiry", () => {
  test("returns a Date roughly 10 minutes in the future", () => {
    const before = Date.now();
    const expiry = verificationTokenExpiry();
    const after = Date.now();
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + 10 * 60 * 1000);
  });
});
