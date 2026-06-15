
/**
 * Long-term memory Store for the v2 assistant (design §6.3).
 *
 * A LangGraph `BaseStore` namespaced by `userId` holds durable, cross-conversation
 * facts: known counterparties, preferences, and salient facts. `prepare` reads a
 * {@link LongTermMemorySnapshot} out of it; `persist` upserts what was learned.
 *
 * Production uses the MongoDB-backed store in the existing database; dev, eval,
 * and the DB-free conformance suite use the in-memory store. The snapshot helpers
 * work against any `BaseStore`, so the surrounding graph never cares which one.
 */
import { InMemoryStore } from "@langchain/langgraph";
import type { BaseStore } from "@langchain/langgraph";
import { MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";
import type { MongoClient } from "mongodb";

import {
  emptyLongTermMemorySnapshot,
  type CounterpartyRecord,
  type LongTermMemorySnapshot,
  type SalientFact,
  type UserPreferences
} from "./types.js";

export const V2_MEMORY_COLLECTION = "ai_v2_memory";

const PREFERENCES_KEY = "preferences";
const COUNTERPARTY_PREFIX = "counterparty:";
const FACT_PREFIX = "fact:";

/** The per-user namespace under which all long-term items are stored. */
export function userNamespace(userId: string): string[] {
  return ["virly", "users", userId];
}

function counterpartyKey(email: string): string {
  return `${COUNTERPARTY_PREFIX}${email.trim().toLowerCase()}`;
}

function factKey(id: string): string {
  return `${FACT_PREFIX}${id}`;
}

/** In-memory long-term store for dev/eval and the DB-free conformance suite. */
export function createInMemoryLongTermStore(): BaseStore {
  return new InMemoryStore();
}

/** MongoDB-backed long-term store over an existing MongoClient. */
export function createMongoLongTermStore(
  client: MongoClient,
  dbName?: string
): BaseStore {
  return new MongoDBStore({
    client: client as unknown as ConstructorParameters<typeof MongoDBStore>[0]["client"],
    dbName,
    collectionName: V2_MEMORY_COLLECTION
  });
}

export type LongTermStoreOptions = {
  /** Supply to persist in MongoDB; omit for the in-memory store. */
  client?: MongoClient;
  dbName?: string;
};

/** Returns a Mongo-backed store when a MongoClient is supplied, else in-memory. */
export function createLongTermStore(
  options: LongTermStoreOptions = {}
): BaseStore {
  if (options.client) {
    return createMongoLongTermStore(options.client, options.dbName);
  }
  return createInMemoryLongTermStore();
}

/** Hydrate the full long-term snapshot for a user from the store. */
export async function readLongTermSnapshot(
  store: BaseStore,
  userId: string
): Promise<LongTermMemorySnapshot> {
  const namespace = userNamespace(userId);
  const items = await store.search(namespace, { limit: 200 });
  const snapshot = emptyLongTermMemorySnapshot();

  for (const item of items) {
    if (item.key === PREFERENCES_KEY) {
      snapshot.preferences = item.value as UserPreferences;
    } else if (item.key.startsWith(COUNTERPARTY_PREFIX)) {
      snapshot.counterparties.push(item.value as CounterpartyRecord);
    } else if (item.key.startsWith(FACT_PREFIX)) {
      snapshot.facts.push(item.value as SalientFact);
    }
  }

  return snapshot;
}

/** Upsert a counterparty record, merging relation (sent_to + received_from -> both). */
export async function upsertCounterparty(
  store: BaseStore,
  userId: string,
  record: CounterpartyRecord
): Promise<void> {
  const namespace = userNamespace(userId);
  const key = counterpartyKey(record.email);
  const existing = (await store.get(namespace, key))?.value as
    | CounterpartyRecord
    | undefined;

  const relation =
    existing && existing.relation !== record.relation ? "both" : record.relation;
  const merged: CounterpartyRecord = {
    ...existing,
    ...record,
    email: record.email.trim().toLowerCase(),
    relation
  };

  await store.put(namespace, key, merged);
}

/** Merge-upsert user preferences. */
export async function upsertPreferences(
  store: BaseStore,
  userId: string,
  preferences: UserPreferences
): Promise<void> {
  const namespace = userNamespace(userId);
  const existing = (await store.get(namespace, PREFERENCES_KEY))?.value as
    | UserPreferences
    | undefined;
  await store.put(namespace, PREFERENCES_KEY, { ...existing, ...preferences });
}

/** Remember a salient free-text fact. */
export async function rememberFact(
  store: BaseStore,
  userId: string,
  fact: SalientFact
): Promise<void> {
  await store.put(userNamespace(userId), factKey(fact.id), fact);
}
