// server/tests/contract/aiConversation.contract.test.ts
import assert from "node:assert/strict";
import { describeContract } from "./harness.js";
import type { AiConversationRecord } from "../../src/repositories/types.js";

function makeConv(
  overrides: Partial<Omit<AiConversationRecord, "id" | "createdAt" | "updatedAt">> = {}
): Omit<AiConversationRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: "a".repeat(24),
    conversationId: "conv-001",
    assistantId: "oshri",
    messages: [{ role: "user", content: "hi" }],
    memory: { lastCounterparty: { email: "x@y.z" } },
    expiresAt: new Date("2024-02-01T00:00:00.000Z"),
    ...overrides
  };
}

describeContract("AiConversationRepository", {
  "upsert inserts a new row and returns it with a 24-hex id": async ({ repos }) => {
    const result = await repos.aiConversations.upsert(makeConv());
    assert.match(result.id, /^[0-9a-fA-F]{24}$/);
    assert.equal(result.userId, "a".repeat(24));
    assert.equal(result.conversationId, "conv-001");
    assert.equal(result.assistantId, "oshri");
    assert.deepEqual(result.messages, [{ role: "user", content: "hi" }]);
    assert.deepEqual(result.memory, { lastCounterparty: { email: "x@y.z" } });
    assert.ok(result.createdAt instanceof Date);
    assert.ok(result.updatedAt instanceof Date);
    assert.ok(result.expiresAt instanceof Date);
  },

  "upsert with same userId+conversationId updates the existing row (no duplicate)": async ({ repos }) => {
    const first = await repos.aiConversations.upsert(
      makeConv({ assistantId: "oshri", messages: [{ role: "user", content: "one" }] })
    );

    const second = await repos.aiConversations.upsert(
      makeConv({
        assistantId: "maya",
        messages: [
          { role: "user", content: "one" },
          { role: "assistant", content: "two" }
        ],
        memory: { step: 2 },
        expiresAt: new Date("2024-03-01T00:00:00.000Z")
      })
    );

    // Same id — updated in place
    assert.equal(second.id, first.id);
    assert.equal(second.assistantId, "maya");
    assert.equal((second.messages as unknown[]).length, 2);
    assert.deepEqual(second.memory, { step: 2 });
    assert.equal(second.expiresAt.toISOString(), "2024-03-01T00:00:00.000Z");
    assert.ok(second.updatedAt >= first.updatedAt);

    // Cross-check via findByConversationId — only one row
    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    assert.ok(found);
    assert.equal(found.id, first.id);
    assert.equal(found.assistantId, "maya");
  },

  "findByConversationId returns null when no row exists": async ({ repos }) => {
    const result = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    assert.equal(result, null);
  },

  "findByConversationId is scoped by userId (different user does not match)": async ({ repos }) => {
    await repos.aiConversations.upsert(makeConv({ userId: "a".repeat(24), conversationId: "conv-001" }));
    const result = await repos.aiConversations.findByConversationId("b".repeat(24), "conv-001");
    assert.equal(result, null);
  },

  "findByConversationId is scoped by conversationId (different conversation does not match)": async ({ repos }) => {
    await repos.aiConversations.upsert(makeConv({ conversationId: "conv-001" }));
    const result = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-999");
    assert.equal(result, null);
  },

  "two different conversations for the same user coexist": async ({ repos }) => {
    const a = await repos.aiConversations.upsert(makeConv({ conversationId: "conv-A", memory: { which: "A" } }));
    const b = await repos.aiConversations.upsert(makeConv({ conversationId: "conv-B", memory: { which: "B" } }));
    assert.notEqual(a.id, b.id);

    const foundA = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-A");
    const foundB = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-B");
    assert.ok(foundA && foundB);
    assert.deepEqual(foundA.memory, { which: "A" });
    assert.deepEqual(foundB.memory, { which: "B" });
  },

  "messages (jsonb array) round-trips a nested structure exactly": async ({ repos }) => {
    const messages = [
      { role: "user", content: "send 50 to dad", meta: { lang: "en", tokens: [1, 2, 3] } },
      { role: "assistant", content: "ok", toolCalls: [{ name: "transfer", args: { amount: 50 } }] }
    ];
    const inserted = await repos.aiConversations.upsert(makeConv({ messages }));
    assert.deepEqual(inserted.messages, messages);

    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    assert.ok(found);
    assert.deepEqual(found.messages, messages);
  },

  "memory (jsonb object) round-trips nested values exactly": async ({ repos }) => {
    const memory = {
      lastCounterparty: { email: "dad@example.com", maskedLabel: "d**@example.com" },
      mentionedCounterparties: [{ email: "a@b.c" }, { email: "d@e.f" }],
      pendingAmount: 50.5
    };
    const inserted = await repos.aiConversations.upsert(makeConv({ memory }));
    assert.deepEqual(inserted.memory, memory);

    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    assert.ok(found);
    assert.deepEqual(found.memory, memory);
  },

  "empty messages array and empty memory object round-trip": async ({ repos }) => {
    const result = await repos.aiConversations.upsert(makeConv({ messages: [], memory: {} }));
    assert.deepEqual(result.messages, []);
    assert.deepEqual(result.memory, {});

    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    assert.ok(found);
    assert.deepEqual(found.messages, []);
    assert.deepEqual(found.memory, {});
  }
});
