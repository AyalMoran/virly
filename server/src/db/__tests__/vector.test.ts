/**
 * Unit tests for db/vector.ts — offline-testable exports only.
 *
 * getAiDb(), runAiMigrations() require a live pgvector Postgres and are not
 * tested here. resolveAiPgUrl() is a pure env-var/config reader and is tested
 * in full. closeAiPool() is trivially safe when no pool has been opened.
 */

describe("resolveAiPgUrl", () => {
  // Save env vars and restore after each test so they don't bleed between tests.
  let savedAiPgUrl: string | undefined;
  let savedVectorDbUrl: string | undefined;

  beforeEach(() => {
    savedAiPgUrl = process.env.VIRLY_AI_PG_URL;
    savedVectorDbUrl = process.env.VIRLY_VECTOR_DB_URL;
  });

  afterEach(() => {
    if (savedAiPgUrl !== undefined) {
      process.env.VIRLY_AI_PG_URL = savedAiPgUrl;
    } else {
      delete process.env.VIRLY_AI_PG_URL;
    }
    if (savedVectorDbUrl !== undefined) {
      process.env.VIRLY_VECTOR_DB_URL = savedVectorDbUrl;
    } else {
      delete process.env.VIRLY_VECTOR_DB_URL;
    }
  });

  test("returns VIRLY_AI_PG_URL when it is set", async () => {
    process.env.VIRLY_AI_PG_URL = "postgres://ai-host/ai-db";
    delete process.env.VIRLY_VECTOR_DB_URL;
    const { resolveAiPgUrl } = await import("../vector.js");
    expect(resolveAiPgUrl()).toBe("postgres://ai-host/ai-db");
  });

  test("falls back to VIRLY_VECTOR_DB_URL when VIRLY_AI_PG_URL is unset", async () => {
    delete process.env.VIRLY_AI_PG_URL;
    process.env.VIRLY_VECTOR_DB_URL = "postgres://vector-host/vec-db";
    const { resolveAiPgUrl } = await import("../vector.js");
    expect(resolveAiPgUrl()).toBe("postgres://vector-host/vec-db");
  });

  test("VIRLY_AI_PG_URL takes priority over VIRLY_VECTOR_DB_URL", async () => {
    process.env.VIRLY_AI_PG_URL = "postgres://primary/db";
    process.env.VIRLY_VECTOR_DB_URL = "postgres://fallback/db";
    const { resolveAiPgUrl } = await import("../vector.js");
    expect(resolveAiPgUrl()).toBe("postgres://primary/db");
  });

  test("throws when neither env var is set and config has no aiPgUrl", async () => {
    delete process.env.VIRLY_AI_PG_URL;
    delete process.env.VIRLY_VECTOR_DB_URL;
    // The config module freezes aiPgUrl at import time from the same env vars.
    // In the test environment both are absent so config.rag.aiPgUrl is undefined.
    // resolveAiPgUrl() must throw a descriptive error in that case.
    const { resolveAiPgUrl } = await import("../vector.js");
    // If config already captured a URL (e.g. VIRLY_POSTGRES_URL was set as
    // fallback during config load) we cannot force a throw in the same process.
    // Guard: only assert the throw when no URL leaked in from config.
    const { config } = await import("../../config.js");
    if (!config.rag.aiPgUrl) {
      expect(() => resolveAiPgUrl()).toThrow(/VIRLY_AI_PG_URL/);
    }
    // When config did capture a URL the function should return it without throwing.
    else {
      expect(() => resolveAiPgUrl()).not.toThrow();
    }
  });
});

describe("closeAiPool", () => {
  test("resolves without error when no pool has been opened", async () => {
    const { closeAiPool } = await import("../vector.js");
    // Should not throw or reject even when the internal pool is null.
    await expect(closeAiPool()).resolves.toBeUndefined();
  });
});
