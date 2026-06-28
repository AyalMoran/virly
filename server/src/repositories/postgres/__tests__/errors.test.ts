

// src/repositories/postgres/errors.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { mapPgError } from "../errors.js";
import { DuplicateKeyError } from "../../types.js";

test("mapPgError converts 23505 to DuplicateKeyError", () => {
  const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_uq" });
  assert.throws(() => mapPgError(e, "email"), (x: unknown) => x instanceof DuplicateKeyError);
});

test("mapPgError converts a Drizzle-wrapped 23505 (on .cause) to DuplicateKeyError", () => {
  const pgErr = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_uq" });
  const drizzleErr = Object.assign(new Error("drizzle wrap"), { cause: pgErr });
  assert.throws(() => mapPgError(drizzleErr, "email"), (x: unknown) => x instanceof DuplicateKeyError);
});

test("mapPgError rethrows other errors unchanged", () => {
  const e = new Error("other");
  assert.throws(() => mapPgError(e, "email"), (x: unknown) => x === e);
});
