/**
 * One-shot setup for the Postgres AI-memory backend (RAG_PLAN.md §7 / M1.5).
 *
 * When `VIRLY_AI_MEMORY_BACKEND=postgres`, the checkpointer + long-term store
 * tables must exist before first use. The server calls this at boot. It is a
 * no-op for the mongo backend (Mongo creates collections lazily), and idempotent.
 */
import { config } from "../../../config.js";
import { setupPostgresCheckpointer } from "./checkpointer.js";
import { getPostgresLongTermStore } from "./postgresStore.js";

export async function setupAiMemoryBackend(): Promise<void> {
  if (config.aiMemoryBackend !== "postgres") return;
  await setupPostgresCheckpointer();
  await getPostgresLongTermStore().setup();
}
