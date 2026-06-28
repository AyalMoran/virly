// src/db/postgres.test.ts
test("getPgDb throws a clear error when no postgres url is configured", async () => {
  const prev = process.env.VIRLY_POSTGRES_URL;
  delete process.env.VIRLY_POSTGRES_URL;
  const mod = await import("../postgres.js");
  try {
    expect(() => mod.getPgDb()).toThrow(/VIRLY_POSTGRES_URL/);
  } finally {
    if (prev !== undefined) process.env.VIRLY_POSTGRES_URL = prev;
  }
});
