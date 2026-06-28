/**
 * Tests for postgresStore.ts.
 *
 * PostgresLongTermStore.batch() calls getAiDb() (a module-level singleton for the
 * AI Postgres). Because this project's native-ESM Jest configuration does not
 * support jest.mock / jest.unstable_mockModule (the `jest` global is not injected
 * in VM-modules mode), the DB-bound batch() methods cannot be tested offline.
 *
 * What CAN be tested offline:
 *   - getPostgresLongTermStore() singleton contract
 *   - PostgresLongTermStore class structure / interface
 *
 * The private helpers (matchesCondition, matchesFilter, toPrefix, fromPrefix,
 * escapeLike, rowToItem) are exercised indirectly by batch() and are not
 * independently exported, so they are not tested here.
 */

import {
  PostgresLongTermStore,
  getPostgresLongTermStore
} from "../postgresStore.js";

// ---------------------------------------------------------------------------
// getPostgresLongTermStore singleton
// ---------------------------------------------------------------------------

describe("getPostgresLongTermStore singleton", () => {
  test("returns a truthy value", () => {
    const store = getPostgresLongTermStore();
    expect(store).toBeTruthy();
  });

  test("returns the same instance on repeated calls (singleton)", () => {
    const a = getPostgresLongTermStore();
    const b = getPostgresLongTermStore();
    expect(a).toBe(b);
  });

  test("returned instance is a PostgresLongTermStore", () => {
    const store = getPostgresLongTermStore();
    expect(store).toBeInstanceOf(PostgresLongTermStore);
  });
});

// ---------------------------------------------------------------------------
// PostgresLongTermStore class interface
// ---------------------------------------------------------------------------

describe("PostgresLongTermStore interface", () => {
  test("exposes a setup() method", () => {
    const store = new PostgresLongTermStore();
    expect(typeof store.setup).toBe("function");
  });

  test("exposes a batch() method (required by BaseStore)", () => {
    const store = new PostgresLongTermStore();
    expect(typeof store.batch).toBe("function");
  });

  test("exposes a get() method (inherited from BaseStore)", () => {
    const store = new PostgresLongTermStore();
    expect(typeof store.get).toBe("function");
  });

  test("exposes a put() method (inherited from BaseStore)", () => {
    const store = new PostgresLongTermStore();
    expect(typeof store.put).toBe("function");
  });

  test("exposes a search() method (inherited from BaseStore)", () => {
    const store = new PostgresLongTermStore();
    expect(typeof store.search).toBe("function");
  });

  test("each new PostgresLongTermStore() creates a distinct instance", () => {
    const a = new PostgresLongTermStore();
    const b = new PostgresLongTermStore();
    expect(a).not.toBe(b);
  });
});
