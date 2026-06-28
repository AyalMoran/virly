// server/tests/contract/aiConversation.contract.test.ts
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
    expect(result.id).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(result.userId).toBe("a".repeat(24));
    expect(result.conversationId).toBe("conv-001");
    expect(result.assistantId).toBe("oshri");
    expect(result.messages).toStrictEqual([{ role: "user", content: "hi" }]);
    expect(result.memory).toStrictEqual({ lastCounterparty: { email: "x@y.z" } });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);
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
    expect(second.id).toBe(first.id);
    expect(second.assistantId).toBe("maya");
    expect((second.messages as unknown[]).length).toBe(2);
    expect(second.memory).toStrictEqual({ step: 2 });
    expect(second.expiresAt.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(second.updatedAt >= first.updatedAt).toBeTruthy();

    // Cross-check via findByConversationId — only one row
    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    expect(found).toBeTruthy();
    expect(found!.id).toBe(first.id);
    expect(found!.assistantId).toBe("maya");
  },

  "findByConversationId returns null when no row exists": async ({ repos }) => {
    const result = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    expect(result).toBeNull();
  },

  "findByConversationId is scoped by userId (different user does not match)": async ({ repos }) => {
    await repos.aiConversations.upsert(makeConv({ userId: "a".repeat(24), conversationId: "conv-001" }));
    const result = await repos.aiConversations.findByConversationId("b".repeat(24), "conv-001");
    expect(result).toBeNull();
  },

  "findByConversationId is scoped by conversationId (different conversation does not match)": async ({ repos }) => {
    await repos.aiConversations.upsert(makeConv({ conversationId: "conv-001" }));
    const result = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-999");
    expect(result).toBeNull();
  },

  "two different conversations for the same user coexist": async ({ repos }) => {
    const a = await repos.aiConversations.upsert(makeConv({ conversationId: "conv-A", memory: { which: "A" } }));
    const b = await repos.aiConversations.upsert(makeConv({ conversationId: "conv-B", memory: { which: "B" } }));
    expect(a.id).not.toBe(b.id);

    const foundA = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-A");
    const foundB = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-B");
    expect(foundA && foundB).toBeTruthy();
    expect(foundA!.memory).toStrictEqual({ which: "A" });
    expect(foundB!.memory).toStrictEqual({ which: "B" });
  },

  "messages (jsonb array) round-trips a nested structure exactly": async ({ repos }) => {
    const messages = [
      { role: "user", content: "send 50 to dad", meta: { lang: "en", tokens: [1, 2, 3] } },
      { role: "assistant", content: "ok", toolCalls: [{ name: "transfer", args: { amount: 50 } }] }
    ];
    const inserted = await repos.aiConversations.upsert(makeConv({ messages }));
    expect(inserted.messages).toStrictEqual(messages);

    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    expect(found).toBeTruthy();
    expect(found!.messages).toStrictEqual(messages);
  },

  "memory (jsonb object) round-trips nested values exactly": async ({ repos }) => {
    const memory = {
      lastCounterparty: { email: "dad@example.com", maskedLabel: "d**@example.com" },
      mentionedCounterparties: [{ email: "a@b.c" }, { email: "d@e.f" }],
      pendingAmount: 50.5
    };
    const inserted = await repos.aiConversations.upsert(makeConv({ memory }));
    expect(inserted.memory).toStrictEqual(memory);

    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    expect(found).toBeTruthy();
    expect(found!.memory).toStrictEqual(memory);
  },

  "empty messages array and empty memory object round-trip": async ({ repos }) => {
    const result = await repos.aiConversations.upsert(makeConv({ messages: [], memory: {} }));
    expect(result.messages).toStrictEqual([]);
    expect(result.memory).toStrictEqual({});

    const found = await repos.aiConversations.findByConversationId("a".repeat(24), "conv-001");
    expect(found).toBeTruthy();
    expect(found!.messages).toStrictEqual([]);
    expect(found!.memory).toStrictEqual({});
  }
});
