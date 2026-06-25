

// src/repositories/registry.ts
import type { Repositories } from "./types.js";
import { createMongoRepositories } from "./mongo/index.js";
import { createPostgresRepositories } from "./postgres/index.js";

export function createRepositories(driver: "mongo" | "postgres"): Repositories {
  if (driver === "mongo") return createMongoRepositories();
  if (driver === "postgres") return createPostgresRepositories();
  throw new Error(`Unknown driver "${driver}".`);
}
