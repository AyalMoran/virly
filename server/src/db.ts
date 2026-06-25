import mongoose from "mongoose";
import { config } from "./config.js";
import { createRepositories } from "./repositories/registry.js";
import { setRepositories } from "./repositories/index.js";
import { getPgDb, runPgMigrations } from "./db/postgres.js";

export async function connectDb() {
  await mongoose.connect(config.mongoUri);
  console.log(`MongoDB connected: ${config.mongoUri}`);
}

/**
 * Build the driver's repositories and register them as the process singleton.
 * In postgres mode, the pool is opened and migrations are applied first so the
 * schema exists before any repo runs a query.
 */
export async function initRepositories(): Promise<void> {
  if (config.dbDriver === "postgres") {
    getPgDb();
    await runPgMigrations();
    console.log("Postgres connected + migrations applied.");
  }
  setRepositories(createRepositories(config.dbDriver));
}

