

// src/config.dbDriver.test.ts
import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  // bust the module cache so config.ts re-evaluates with new env
  const mod = await import(`./config.js?ts=${Date.now()}`);
  process.env = prev;
  return mod.config as typeof import("./config.js").config;
}

test("dbDriver defaults to mongo", async () => {
  const config = await loadConfig({ VIRLY_DB_DRIVER: undefined });
  assert.equal(config.dbDriver, "mongo");
});

test("dbDriver=postgres requires VIRLY_POSTGRES_URL", async () => {
  await assert.rejects(
    () =>
      loadConfig({
        VIRLY_DB_DRIVER: "postgres",
        VIRLY_POSTGRES_URL: undefined
      }),
    /VIRLY_POSTGRES_URL/
  );
});

test("dbDriver=postgres accepts a postgres url", async () => {
  const config = await loadConfig({
    VIRLY_DB_DRIVER: "postgres",
    VIRLY_POSTGRES_URL: "postgres://localhost:5432/virly"
  });
  assert.equal(config.dbDriver, "postgres");
  assert.equal(config.postgresUrl, "postgres://localhost:5432/virly");
});
