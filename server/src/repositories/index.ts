

// src/repositories/index.ts
import type { Repositories } from "./types.js";

let instance: Repositories | null = null;

export function setRepositories(repos: Repositories): void {
  instance = repos;
}

export function getRepositories(): Repositories {
  if (!instance) throw new Error("Repositories not initialised. Call setRepositories at boot.");
  return instance;
}

export * from "./types.js";
