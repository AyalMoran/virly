
/**
 * Memory-in-the-loop wiring (design §6 / Phase 6).
 *
 * Bridges the long-term `Store` to a turn: hydrate known counterparties + the
 * rolling summary before the model runs, and upsert what was learned after. All
 * functions degrade to no-ops when no store is available (the DB-free conformance
 * path), so they never change in-process behavior.
 */
import type { BaseStore } from "@langchain/langgraph";
import mongoose from "mongoose";

import { config } from "../../../config.js";
import type { CounterpartyMemory } from "../../state.js";
import type { KnownCounterparty } from "../prompt.js";
import { createMongoLongTermStore } from "./store.js";
import { readLongTermSnapshot, upsertCounterparty, userNamespace } from "./store.js";
import { getPostgresLongTermStore } from "./postgresStore.js";

let cachedStore: BaseStore | undefined;
let storeResolved = false;

/**
 * The long-term store for the active AI-memory backend: the Postgres store when
 * `VIRLY_AI_MEMORY_BACKEND=postgres`, otherwise the Mongo store when connected;
 * undefined otherwise (eval/dev → in-memory behavior).
 */
export function resolveLongTermStore(): BaseStore | undefined {
  if (storeResolved && cachedStore) {
    return cachedStore;
  }
  // Only latch on SUCCESS: if the store can't be resolved yet (e.g. a transient
  // Mongo reconnect window at first use), leave it unresolved so a later turn can
  // retry — otherwise long-term memory would stay disabled for the process life.
  try {
    if (config.aiMemoryBackend === "postgres") {
      cachedStore = getPostgresLongTermStore();
    } else if (mongoose.connection.readyState === 1) {
      cachedStore = createMongoLongTermStore(mongoose.connection.getClient());
    }
  } catch {
    cachedStore = undefined;
  }
  storeResolved = cachedStore !== undefined;
  return cachedStore;
}

const SUMMARY_KEY = (conversationId: string) => `summary:${conversationId}`;

// All reads/writes below degrade to a no-op on a store error so a transient
// store outage (e.g. the AI Postgres restarting) loses long-term memory for the
// turn rather than failing the turn — matching the Mongo path's behavior when
// the store is unavailable.

export async function readConversationSummary(
  store: BaseStore,
  userId: string,
  conversationId: string
): Promise<string | undefined> {
  try {
    const item = await store.get(userNamespace(userId), SUMMARY_KEY(conversationId));
    const text = (item?.value as { text?: string } | undefined)?.text;
    return typeof text === "string" && text.trim() ? text : undefined;
  } catch {
    return undefined;
  }
}

export async function saveConversationSummary(
  store: BaseStore,
  userId: string,
  conversationId: string,
  summary: string
): Promise<void> {
  try {
    await store.put(userNamespace(userId), SUMMARY_KEY(conversationId), {
      text: summary,
      updatedAt: new Date().toISOString()
    });
  } catch {
    // best-effort: a failed summary write must not fail the turn.
  }
}

/** Merge conversation-scoped known counterparties with durable long-term ones. */
export async function withLongTermCounterparties(
  store: BaseStore | undefined,
  userId: string,
  conversationKnown: KnownCounterparty[]
): Promise<KnownCounterparty[]> {
  if (!store || !userId) {
    return conversationKnown;
  }
  let snapshot;
  try {
    snapshot = await readLongTermSnapshot(store, userId);
  } catch {
    // Store unavailable: answer with just the conversation-scoped counterparties.
    return conversationKnown;
  }
  const byEmail = new Map<string, KnownCounterparty>();
  for (const known of conversationKnown) {
    byEmail.set(known.email.toLowerCase(), known);
  }
  for (const cp of snapshot.counterparties) {
    const email = cp.email.toLowerCase();
    if (!byEmail.has(email)) {
      const localpart = email.split("@")[0] ?? email;
      byEmail.set(email, {
        email,
        label: cp.displayName ?? localpart,
        aliases: localpart && localpart !== cp.displayName ? [localpart] : []
      });
    }
  }
  return [...byEmail.values()];
}

/** Persist counterparties the user interacted with this turn into long-term memory. */
export async function upsertInteractedCounterparties(
  store: BaseStore | undefined,
  userId: string,
  memory: CounterpartyMemory
): Promise<void> {
  if (!store || !userId) {
    return;
  }
  try {
    for (const ref of memory.mentionedCounterparties) {
      await upsertCounterparty(store, userId, {
        email: ref.email,
        displayName: ref.displayName ?? undefined,
        relation: "both",
        lastInteractionAt: new Date().toISOString()
      });
    }
  } catch {
    // best-effort: failing to persist long-term memory must not fail the turn.
  }
}
