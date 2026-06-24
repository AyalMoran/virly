

// src/repositories/registry.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createRepositories } from "./registry.js";
import { clearRepositories, getRepositories, setRepositories } from "./index.js";

test("createRepositories('mongo') returns a full Repositories object", () => {
  const repos = createRepositories("mongo");
  assert.equal(typeof repos.users.findById, "function");
  assert.equal(typeof repos.runInTransaction, "function");
});

test("createRepositories('postgres') returns a full Repositories object", () => {
  // The postgres repos are static objects that lazily resolve `getPgDb()` only at
  // query time, so construction needs no DB connection or VIRLY_POSTGRES_URL.
  const repos = createRepositories("postgres");
  assert.equal(typeof repos.users.findById, "function");
  assert.equal(typeof repos.runInTransaction, "function");
});

test("getRepositories throws before setRepositories", async () => {
  const fresh = await import(`./index.js?ts=${Date.now()}`);
  assert.throws(() => fresh.getRepositories(), /not initialised/i);
});

test("setRepositories then getRepositories returns the instance", () => {
  const repos = createRepositories("mongo");
  setRepositories(repos);
  assert.equal(getRepositories(), repos);
  clearRepositories();
  assert.throws(() => getRepositories(), /not initialised/i);
});
