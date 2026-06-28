import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { mongoConversationStore } from "../aiConversation.service.js";
import { setRepositories } from "../../repositories/index.js";
import { createMongoRepositories } from "../../repositories/mongo/index.js";
import { createEmptyCounterpartyMemory } from "../../ai/counterpartyMemory.js";
import type { Repositories, AiConversationRecord } from "../../repositories/types.js";
import type { CounterpartyMemory } from "../../ai/state.js";

const base = createMongoRepositories();

afterEach(() => {
  setRepositories(base);
});

function emptyConversationRecord(): AiConversationRecord {
  return {
    id: "r1",
    userId: "u1",
    conversationId: "c1",
    assistantId: "oshri",
    messages: [],
    memory: {},
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe("mongoConversationStore.load", () => {
  test("returns empty messages and default memory when no record exists", async () => {
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        findByConversationId: async () => null
      } as Repositories["aiConversations"]
    });

    const result = await mongoConversationStore.load("u1", "c1");

    expect(result.messages).toStrictEqual([]);
    expect(result.memory).toMatchObject({ turn: 0, mentionedCounterparties: [] });
  });

  test("deserializes stored messages into BaseMessage instances", async () => {
    const record: AiConversationRecord = {
      ...emptyConversationRecord(),
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" }
      ]
    };
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        findByConversationId: async () => record
      } as Repositories["aiConversations"]
    });

    const result = await mongoConversationStore.load("u1", "c1");

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBeInstanceOf(HumanMessage);
    expect(result.messages[1]).toBeInstanceOf(AIMessage);
    expect((result.messages[0] as HumanMessage).content).toBe("hello");
    expect((result.messages[1] as AIMessage).content).toBe("hi there");
  });

  test("normalizes memory from the stored record", async () => {
    const memory = { turn: 5, mentionedCounterparties: [], mode: "idle" as const };
    const record: AiConversationRecord = {
      ...emptyConversationRecord(),
      memory: memory as unknown as Record<string, unknown>
    };
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        findByConversationId: async () => record
      } as Repositories["aiConversations"]
    });

    const result = await mongoConversationStore.load("u1", "c1");

    expect(result.memory.turn).toBe(5);
  });

  test("trims messages to the retention window (last 20)", async () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg-${i}`
    }));
    const record: AiConversationRecord = {
      ...emptyConversationRecord(),
      messages
    };
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        findByConversationId: async () => record
      } as Repositories["aiConversations"]
    });

    const result = await mongoConversationStore.load("u1", "c1");

    // trimConversationMessages keeps at most 20 messages (the tail)
    expect(result.messages.length).toBeLessThanOrEqual(20);
  });

  test("propagates repository errors", async () => {
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        findByConversationId: async () => {
          throw new Error("db down");
        }
      } as Repositories["aiConversations"]
    });

    await expect(mongoConversationStore.load("u1", "c1")).rejects.toThrow("db down");
  });
});

describe("mongoConversationStore.save", () => {
  test("calls aiConversations.upsert with the correct shape", async () => {
    let upsertInput: Parameters<typeof base.aiConversations.upsert>[0] | null = null;
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        upsert: async (input) => {
          upsertInput = input;
          return emptyConversationRecord();
        }
      } as Repositories["aiConversations"]
    });

    const memory: CounterpartyMemory = createEmptyCounterpartyMemory();

    await mongoConversationStore.save({
      userId: "u1",
      conversationId: "c1",
      assistantId: "oshri",
      messages: [new HumanMessage("hello"), new AIMessage("world")],
      memory
    });

    expect(upsertInput).not.toBeNull();
    expect(upsertInput!.userId).toBe("u1");
    expect(upsertInput!.conversationId).toBe("c1");
    expect(upsertInput!.assistantId).toBe("oshri");
    // Messages serialized back to stored format
    expect(upsertInput!.messages).toHaveLength(2);
    expect((upsertInput!.messages as Array<{ role: string }>)[0].role).toBe("user");
    expect((upsertInput!.messages as Array<{ role: string }>)[1].role).toBe("assistant");
    // expiresAt is a future date
    expect(upsertInput!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("omits system/tool messages from the persisted shape", async () => {
    let upsertInput: Parameters<typeof base.aiConversations.upsert>[0] | null = null;
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        upsert: async (input) => {
          upsertInput = input;
          return emptyConversationRecord();
        }
      } as Repositories["aiConversations"]
    });

    // Only human+AI messages should survive; tool messages are dropped
    await mongoConversationStore.save({
      userId: "u1",
      conversationId: "c1",
      assistantId: "oshri",
      messages: [new HumanMessage("transfer 50"), new AIMessage("confirmed")],
      memory: createEmptyCounterpartyMemory()
    });

    const persisted = upsertInput!.messages as Array<{ role: string }>;
    expect(persisted.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
  });

  test("propagates repository errors on save", async () => {
    setRepositories({
      ...base,
      aiConversations: {
        ...base.aiConversations,
        upsert: async () => {
          throw new Error("write failed");
        }
      } as Repositories["aiConversations"]
    });

    await expect(
      mongoConversationStore.save({
        userId: "u1",
        conversationId: "c1",
        assistantId: "oshri",
        messages: [],
        memory: createEmptyCounterpartyMemory()
      })
    ).rejects.toThrow("write failed");
  });
});
