
// src/repositories/postgres/id.test.ts
import { newObjectId, isObjectIdHex } from "../id.js";

test("newObjectId returns a fresh 24-hex string", () => {
  const a = newObjectId();
  expect(a).toMatch(/^[0-9a-f]{24}$/);
  expect(a).not.toBe(newObjectId());
});

test("isObjectIdHex accepts 24-hex and rejects junk", () => {
  expect(isObjectIdHex("507f1f77bcf86cd799439011")).toBe(true);
  expect(isObjectIdHex("nope")).toBe(false);
});
