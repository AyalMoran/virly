
// src/repositories/types.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { DuplicateKeyError } from "./types.js";

test("DuplicateKeyError carries the conflicting key and is an Error", () => {
  const err = new DuplicateKeyError("email");
  assert.ok(err instanceof Error);
  assert.equal(err.key, "email");
  assert.match(err.message, /email/);
});
