
// src/repositories/types.test.ts
import { DuplicateKeyError } from "../types.js";

test("DuplicateKeyError carries the conflicting key and is an Error", () => {
  const err = new DuplicateKeyError("email");
  expect(err).toBeInstanceOf(Error);
  expect(err.key).toBe("email");
  expect(err.message).toMatch(/email/);
});
