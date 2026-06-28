

// src/db.boot.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { initRepositories } from "../db.js";
import { getRepositories } from "../repositories/index.js";

test("initRepositories registers the mongo driver repositories", () => {
  initRepositories();
  assert.equal(typeof getRepositories().users.findById, "function");
});
