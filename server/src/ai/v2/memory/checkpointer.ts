
/**
 * Thread-memory checkpointer for the v2 graph (design §6.1).
 *
 * The checkpointer persists the full `messages` thread per
 * `thread_id = conversationId` and restores it at the start of every turn, which
 * is what makes coreference / "the amount we discussed" resolvable from the real
 * conversation. It also underpins `interrupt`/resume for transfers (Phase 5).
 *
 * Production uses a MongoDB-backed saver in the existing database; dev, eval, and
 * the read-only in-process path use an in-memory saver. The conformance suite is
 * DB-free, so it never constructs the Mongo saver.
 */
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { MongoClient } from "mongodb";

import { config } from "../../../config.js";

export const V2_CHECKPOINT_COLLECTION = "ai_v2_checkpoints";
export const V2_CHECKPOINT_WRITES_COLLECTION = "ai_v2_checkpoint_writes";

/** In-memory thread checkpointer for dev/eval and the read-only in-process loop. */
export function createInMemoryCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}

/** MongoDB-backed thread checkpointer over an existing MongoClient. */
export function createMongoCheckpointer(
  client: MongoClient,
  dbName?: string
): BaseCheckpointSaver {
  return new MongoDBSaver({
    client: client as unknown as ConstructorParameters<typeof MongoDBSaver>[0]["client"],
    dbName,
    checkpointCollectionName: V2_CHECKPOINT_COLLECTION,
    checkpointWritesCollectionName: V2_CHECKPOINT_WRITES_COLLECTION
  });
}

/**
 * Postgres-backed thread checkpointer over the dedicated AI Postgres (M1.5).
 *
 * `PostgresSaver` manages its own pool from the connection string. A process-wide
 * singleton is reused so the resumable graph and `setup()` share one instance.
 * `setupPostgresCheckpointer()` (called at boot) creates its tables idempotently.
 */
let pgCheckpointer: PostgresSaver | undefined;

function aiPgUrl(): string {
  const url =
    process.env.VIRLY_AI_PG_URL ??
    process.env.VIRLY_VECTOR_DB_URL ??
    config.rag.aiPgUrl;
  if (!url) {
    throw new Error("VIRLY_AI_PG_URL is required for the postgres AI-memory backend.");
  }
  return url;
}

export function getPostgresCheckpointer(): BaseCheckpointSaver {
  if (!pgCheckpointer) {
    pgCheckpointer = PostgresSaver.fromConnString(aiPgUrl());
  }
  return pgCheckpointer as unknown as BaseCheckpointSaver;
}

/** Create the checkpoint tables (idempotent). Call once at boot. */
export async function setupPostgresCheckpointer(): Promise<void> {
  await (getPostgresCheckpointer() as unknown as PostgresSaver).setup();
}

export type CheckpointerOptions = {
  /** Supply to persist threads in MongoDB; omit for an in-memory saver. */
  client?: MongoClient;
  dbName?: string;
};

/**
 * Returns a Mongo-backed checkpointer when a MongoClient is supplied, otherwise
 * an in-memory one. Keeping the choice here lets callers stay agnostic.
 */
export function createCheckpointer(
  options: CheckpointerOptions = {}
): BaseCheckpointSaver {
  if (options.client) {
    return createMongoCheckpointer(options.client, options.dbName);
  }
  return createInMemoryCheckpointer();
}
