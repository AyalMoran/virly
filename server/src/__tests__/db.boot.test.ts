

// src/db.boot.test.ts
import { initRepositories } from "../db.js";
import { getRepositories } from "../repositories/index.js";

test("initRepositories registers the mongo driver repositories", () => {
  initRepositories();
  expect(typeof getRepositories().users.findById).toBe("function");
});
