/**
 * Tests for loop.ts — the memory-in-the-loop bridge functions.
 *
 * All tests use InMemoryStore (no Postgres, no Mongo) to stay offline.
 * resolveLongTermStore() itself mutates module-level singletons and depends on
 * config/mongoose, so it is tested separately via a lightweight structural check.
 */
import { InMemoryStore } from "@langchain/langgraph";

import {
  readConversationSummary,
  saveConversationSummary,
  withLongTermCounterparties,
  upsertInteractedCounterparties
} from "../loop.js";
import { upsertCounterparty } from "../store.js";
import type { CounterpartyMemory } from "../../../../ai/state.js";

// Minimal CounterpartyMemory with no counterparties.
function emptyMemory(): CounterpartyMemory {
  return {
    turn: 1,
    mentionedCounterparties: []
  };
}

// Minimal CounterpartyMemory with one counterparty.
function memoryWith(email: string, displayName?: string): CounterpartyMemory {
  return {
    turn: 1,
    mentionedCounterparties: [
      {
        email,
        maskedLabel: email.slice(0, 1) + "***",
        userLabel: displayName ?? email,
        firstMentionedAtTurn: 1,
        lastReferencedAtTurn: 1,
        displayName
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// readConversationSummary / saveConversationSummary
// ---------------------------------------------------------------------------

describe("saveConversationSummary + readConversationSummary", () => {
  test("round-trips a summary through the store", async () => {
    const store = new InMemoryStore();
    await saveConversationSummary(store, "user-1", "conv-1", "Earlier: Dan sent 200.");
    const result = await readConversationSummary(store, "user-1", "conv-1");
    expect(result).toBe("Earlier: Dan sent 200.");
  });

  test("returns undefined when no summary has been written", async () => {
    const store = new InMemoryStore();
    const result = await readConversationSummary(store, "user-x", "conv-new");
    expect(result).toBeUndefined();
  });

  test("different conversation IDs are isolated", async () => {
    const store = new InMemoryStore();
    await saveConversationSummary(store, "user-1", "conv-A", "Summary A");
    await saveConversationSummary(store, "user-1", "conv-B", "Summary B");
    const a = await readConversationSummary(store, "user-1", "conv-A");
    const b = await readConversationSummary(store, "user-1", "conv-B");
    expect(a).toBe("Summary A");
    expect(b).toBe("Summary B");
  });

  test("different user IDs are isolated", async () => {
    const store = new InMemoryStore();
    await saveConversationSummary(store, "user-1", "conv-1", "User-1 summary");
    await saveConversationSummary(store, "user-2", "conv-1", "User-2 summary");
    const u1 = await readConversationSummary(store, "user-1", "conv-1");
    const u2 = await readConversationSummary(store, "user-2", "conv-1");
    expect(u1).toBe("User-1 summary");
    expect(u2).toBe("User-2 summary");
  });

  test("overwrites an existing summary", async () => {
    const store = new InMemoryStore();
    await saveConversationSummary(store, "u", "c", "First version");
    await saveConversationSummary(store, "u", "c", "Second version");
    const result = await readConversationSummary(store, "u", "c");
    expect(result).toBe("Second version");
  });

  test("returns undefined when the stored text is only whitespace", async () => {
    const store = new InMemoryStore();
    // Directly put a whitespace-only value into the store.
    await store.put(["virly", "users", "u"], "summary:c-ws", { text: "   " });
    const result = await readConversationSummary(store, "u", "c-ws");
    expect(result).toBeUndefined();
  });

  test("degrades gracefully when store.get rejects", async () => {
    const brokenStore = {
      get: async () => { throw new Error("DB down"); },
      put: async () => {}
    } as unknown as InMemoryStore;
    const result = await readConversationSummary(brokenStore, "u", "c");
    expect(result).toBeUndefined();
  });

  test("degrades gracefully when store.put rejects", async () => {
    const brokenStore = {
      put: async () => { throw new Error("DB down"); }
    } as unknown as InMemoryStore;
    // Must not throw
    await expect(saveConversationSummary(brokenStore, "u", "c", "text")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// withLongTermCounterparties
// ---------------------------------------------------------------------------

describe("withLongTermCounterparties", () => {
  test("returns conversation-scoped list when store is undefined", async () => {
    const cp = { email: "rani@example.com", label: "Rani", aliases: [] };
    const result = await withLongTermCounterparties(undefined, "u", [cp]);
    expect(result).toStrictEqual([cp]);
  });

  test("returns conversation-scoped list when userId is empty string", async () => {
    const store = new InMemoryStore();
    const cp = { email: "rani@example.com", label: "Rani", aliases: [] };
    const result = await withLongTermCounterparties(store, "", [cp]);
    expect(result).toStrictEqual([cp]);
  });

  test("merges long-term counterparties not in the conversation list", async () => {
    const store = new InMemoryStore();
    await upsertCounterparty(store, "user-1", {
      email: "dan@example.com",
      displayName: "Dan Levi",
      relation: "both",
      lastInteractionAt: "2026-06-01T00:00:00.000Z"
    });
    const conversationKnown = [
      { email: "rani@example.com", label: "Rani", aliases: [] }
    ];
    const result = await withLongTermCounterparties(store, "user-1", conversationKnown);
    const emails = result.map((r) => r.email);
    expect(emails).toContain("rani@example.com");
    expect(emails).toContain("dan@example.com");
  });

  test("conversation-scoped entry wins over long-term entry for same email", async () => {
    const store = new InMemoryStore();
    await upsertCounterparty(store, "user-1", {
      email: "rani@example.com",
      displayName: "Old Name",
      relation: "sent_to"
    });
    const conversationKnown = [
      { email: "rani@example.com", label: "Fresh Rani", aliases: ["rani"] }
    ];
    const result = await withLongTermCounterparties(store, "user-1", conversationKnown);
    const ranis = result.filter((r) => r.email === "rani@example.com");
    expect(ranis.length).toBe(1);
    // The conversation-scoped entry is preserved
    expect(ranis[0]?.label).toBe("Fresh Rani");
  });

  test("email matching is case-insensitive", async () => {
    const store = new InMemoryStore();
    await upsertCounterparty(store, "user-1", {
      email: "Dan@Example.com",
      displayName: "Dan",
      relation: "sent_to"
    });
    const conversationKnown = [
      { email: "DAN@EXAMPLE.COM", label: "Dan uppercase", aliases: [] }
    ];
    const result = await withLongTermCounterparties(store, "user-1", conversationKnown);
    // Both normalize to the same email in the map key — should be deduplicated.
    // The conversation-scoped object's email field retains its original casing.
    const dans = result.filter((r) => r.email.toLowerCase() === "dan@example.com");
    expect(dans.length).toBe(1);
  });

  test("returns only conversation-scoped when store has no counterparties for user", async () => {
    const store = new InMemoryStore();
    const cp = { email: "x@example.com", label: "X", aliases: [] };
    const result = await withLongTermCounterparties(store, "new-user", [cp]);
    expect(result).toStrictEqual([cp]);
  });

  test("degrades to conversation-scoped list when store.search rejects", async () => {
    const brokenStore = {
      search: async () => { throw new Error("DB down"); }
    } as unknown as InMemoryStore;
    const cp = { email: "rani@example.com", label: "Rani", aliases: [] };
    const result = await withLongTermCounterparties(brokenStore, "user-1", [cp]);
    expect(result).toStrictEqual([cp]);
  });
});

// ---------------------------------------------------------------------------
// upsertInteractedCounterparties
// ---------------------------------------------------------------------------

describe("upsertInteractedCounterparties", () => {
  test("no-op when store is undefined", async () => {
    const memory = memoryWith("rani@example.com", "Rani");
    // Must not throw
    await expect(upsertInteractedCounterparties(undefined, "u", memory)).resolves.toBeUndefined();
  });

  test("no-op when userId is empty string", async () => {
    const store = new InMemoryStore();
    const memory = memoryWith("rani@example.com", "Rani");
    await expect(upsertInteractedCounterparties(store, "", memory)).resolves.toBeUndefined();
  });

  test("persists each mentioned counterparty into the store", async () => {
    const store = new InMemoryStore();
    const memory: CounterpartyMemory = {
      turn: 1,
      mentionedCounterparties: [
        {
          email: "rani@example.com",
          maskedLabel: "r***",
          userLabel: "Rani",
          firstMentionedAtTurn: 1,
          lastReferencedAtTurn: 1,
          displayName: "Rani Cohen"
        }
      ]
    };
    await upsertInteractedCounterparties(store, "user-1", memory);
    const items = await store.search(["virly", "users", "user-1"], { limit: 50 });
    const emails = items.map((i) => (i.value as { email: string }).email);
    expect(emails).toContain("rani@example.com");
  });

  test("no-op when mentionedCounterparties is empty", async () => {
    const store = new InMemoryStore();
    await upsertInteractedCounterparties(store, "user-1", emptyMemory());
    const items = await store.search(["virly", "users", "user-1"], { limit: 50 });
    expect(items.length).toBe(0);
  });

  test("degrades gracefully when the store rejects", async () => {
    const brokenStore = {
      get: async () => { throw new Error("DB down"); },
      put: async () => { throw new Error("DB down"); }
    } as unknown as InMemoryStore;
    const memory = memoryWith("rani@example.com");
    // Must not throw
    await expect(
      upsertInteractedCounterparties(brokenStore, "user-1", memory)
    ).resolves.toBeUndefined();
  });
});
