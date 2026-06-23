import mongoose from "mongoose";
import { config } from "./config.js";
import { createRepositories } from "./repositories/registry.js";
import { setRepositories } from "./repositories/index.js";

export async function connectDb() {
  await mongoose.connect(config.mongoUri);
  console.log(`MongoDB connected: ${config.mongoUri}`);
}

/** Build the driver's repositories and register them as the process singleton. */
export function initRepositories(): void {
  setRepositories(createRepositories(config.dbDriver));
}

