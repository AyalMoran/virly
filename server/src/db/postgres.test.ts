

// src/db/postgres.test.ts
import assert from "node:assert/strict";
import test from "node:test";

test("getPgDb throws a clear error when no postgres url is configured", async () => {
  const prev = process.env.VIRLY_POSTGRES_URL;
  delete process.env.VIRLY_POSTGRES_URL;
  const mod = await import(`./postgres.js?ts=${Date.now()}`);
  try {
    assert.throws(() => mod.getPgDb(), /VIRLY_POSTGRES_URL/);
  } finally {
    if (prev !== undefined) process.env.VIRLY_POSTGRES_URL = prev;
  }
});
