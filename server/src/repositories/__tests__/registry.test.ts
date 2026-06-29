
// src/repositories/registry.test.ts
import { createRepositories } from "../registry.js";
import { clearRepositories, getRepositories, setRepositories } from "../index.js";

test("createRepositories('mongo') returns a full Repositories object", () => {
  const repos = createRepositories("mongo");
  expect(typeof repos.users.findById).toBe("function");
  expect(typeof repos.runInTransaction).toBe("function");
});

test("createRepositories('postgres') returns a full Repositories object", () => {
  // The postgres repos are static objects that lazily resolve `getPgDb()` only at
  // query time, so construction needs no DB connection or VIRLY_POSTGRES_URL.
  const repos = createRepositories("postgres");
  expect(typeof repos.users.findById).toBe("function");
  expect(typeof repos.runInTransaction).toBe("function");
});

test("getRepositories throws before setRepositories", async () => {
  const fresh = await import("../index.js");
  expect(() => fresh.getRepositories()).toThrow(/not initialised/i);
});

test("setRepositories then getRepositories returns the instance", () => {
  const repos = createRepositories("mongo");
  setRepositories(repos);
  expect(getRepositories()).toBe(repos);
  clearRepositories();
  expect(() => getRepositories()).toThrow(/not initialised/i);
});
