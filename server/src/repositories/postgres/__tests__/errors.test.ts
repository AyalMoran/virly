
// src/repositories/postgres/errors.test.ts
import { mapPgError } from "../errors.js";
import { DuplicateKeyError } from "../../types.js";

test("mapPgError converts 23505 to DuplicateKeyError", () => {
  const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_uq" });
  let err: unknown;
  try { mapPgError(e, "email"); } catch (x) { err = x; }
  expect(err).toBeInstanceOf(DuplicateKeyError);
});

test("mapPgError converts a Drizzle-wrapped 23505 (on .cause) to DuplicateKeyError", () => {
  const pgErr = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_uq" });
  const drizzleErr = Object.assign(new Error("drizzle wrap"), { cause: pgErr });
  let err: unknown;
  try { mapPgError(drizzleErr, "email"); } catch (x) { err = x; }
  expect(err).toBeInstanceOf(DuplicateKeyError);
});

test("mapPgError rethrows other errors unchanged", () => {
  const e = new Error("other");
  let thrown: unknown;
  try { mapPgError(e, "email"); } catch (x) { thrown = x; }
  expect(thrown).toBe(e);
});
