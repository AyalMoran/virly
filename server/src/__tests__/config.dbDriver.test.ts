
// src/config.dbDriver.test.ts
import { jest } from "@jest/globals";

async function loadConfig(env: Record<string, string | undefined>) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  let mod: { config: typeof import("../config.js").config } | undefined;
  // jest.isolateModulesAsync resets the module registry so config.ts
  // re-evaluates against the patched process.env on each call.
  await jest.isolateModulesAsync(async () => {
    mod = (await import("../config.js")) as { config: typeof import("../config.js").config };
  });
  process.env = prev;
  return mod!.config;
}

test("dbDriver defaults to mongo", async () => {
  const config = await loadConfig({ VIRLY_DB_DRIVER: undefined });
  expect(config.dbDriver).toBe("mongo");
});

test("dbDriver=postgres requires VIRLY_POSTGRES_URL", async () => {
  const err = await loadConfig({
    VIRLY_DB_DRIVER: "postgres",
    VIRLY_POSTGRES_URL: undefined
  }).then(() => null, (e) => e);
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toMatch(/VIRLY_POSTGRES_URL/);
});

test("dbDriver=postgres accepts a postgres url", async () => {
  const config = await loadConfig({
    VIRLY_DB_DRIVER: "postgres",
    VIRLY_POSTGRES_URL: "postgres://localhost:5432/virly"
  });
  expect(config.dbDriver).toBe("postgres");
  expect(config.postgresUrl).toBe("postgres://localhost:5432/virly");
});
