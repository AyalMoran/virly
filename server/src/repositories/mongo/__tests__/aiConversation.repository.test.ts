
// src/repositories/mongo/aiConversation.repository.test.ts
import { AiConversation } from "../../../models/AiConversation.js";
import { mongoAiConversationRepository } from "../aiConversation.repository.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  const orig = o[k]; o[k] = v; cleanups.push(() => { o[k] = orig; });
}

const USER_OID = "507f1f77bcf86cd799439011";
const CONV_OID = "507f191e810c19729de860ea";

const leanConv = {
  _id: CONV_OID,
  userId: USER_OID,
  conversationId: "conv-abc-123",
  assistantId: "oshri",
  messages: [{ role: "user", content: "hello", createdAt: new Date("2026-01-01T00:00:00.000Z") }],
  memory: { turn: 1, lastCounterparty: null, mentionedCounterparties: [], entities: [], answerFrames: [], pendingConfirmation: null, clarification: null, transferIntentFrame: null, mode: "idle" },
  expiresAt: new Date("2026-07-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

// ---------------------------------------------------------------------------
// findByConversationId
// ---------------------------------------------------------------------------

test("findByConversationId: maps lean doc to AiConversationRecord with string id", async () => {
  const fakeChain = { session: () => fakeChain, lean: async () => leanConv };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");

  expect(rec).toBeTruthy();
  expect(rec!.id).toBe(CONV_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec!.userId).toBe(USER_OID);
  expect(rec!.conversationId).toBe("conv-abc-123");
  expect(rec!.assistantId).toBe("oshri");
  expect(rec!.messages).toStrictEqual(leanConv.messages);
  expect(rec!.memory).toStrictEqual(leanConv.memory);
  expect(rec!.expiresAt).toBeInstanceOf(Date);
  expect(rec!.createdAt).toBeInstanceOf(Date);
  expect(rec!.updatedAt).toBeInstanceOf(Date);
});

test("findByConversationId: returns null when not found", async () => {
  const fakeChain = { session: () => fakeChain, lean: async () => null };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  expect(rec).toBeNull();
});

test("findByConversationId: queries by userId and conversationId", async () => {
  let capturedFilter: unknown;
  const fakeChain = {
    session: () => fakeChain,
    lean: async () => null
  };
  patch(
    AiConversation,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof AiConversation.findOne
  );

  await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  expect(capturedFilter).toStrictEqual({ userId: USER_OID, conversationId: "conv-abc-123" });
});

test("findByConversationId: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedSession: unknown;
  const fakeChain = {
    session: (s: unknown) => { capturedSession = s; return fakeChain; },
    lean: async () => null
  };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne
  );

  await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123", fakeSession);
  expect(capturedSession).toBe(fakeSession);
});

test("findByConversationId: messages array passes through unchanged", async () => {
  const specialMessages = [
    { role: "user", content: "hello", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { role: "assistant", content: "hi there", createdAt: new Date("2026-01-01T00:01:00.000Z") }
  ];
  const leanWithMessages = { ...leanConv, messages: specialMessages };
  const fakeChain = { session: () => fakeChain, lean: async () => leanWithMessages };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  expect(rec).toBeTruthy();
  expect(rec!.messages).toStrictEqual(specialMessages);
});

test("findByConversationId: memory object passes through unchanged", async () => {
  const specialMemory = { turn: 5, lastCounterparty: { email: "bob@example.com" }, mentionedCounterparties: [], entities: [{ foo: "bar" }], answerFrames: [], pendingConfirmation: null, clarification: null, transferIntentFrame: null, mode: "idle" };
  const leanWithMemory = { ...leanConv, memory: specialMemory };
  const fakeChain = { session: () => fakeChain, lean: async () => leanWithMemory };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  expect(rec).toBeTruthy();
  expect(rec!.memory).toStrictEqual(specialMemory);
});

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

test("upsert: calls findOneAndUpdate with userId+conversationId filter, $set body, upsert+new options", async () => {
  let capturedFilter: unknown;
  let capturedUpdate: unknown;
  let capturedOpts: unknown;

  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (filter: unknown, update: unknown, opts: unknown) => {
      capturedFilter = filter;
      capturedUpdate = update;
      capturedOpts = opts;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate
  );

  const input = {
    userId: USER_OID,
    conversationId: "conv-abc-123",
    assistantId: "oshri",
    messages: leanConv.messages,
    memory: leanConv.memory,
    expiresAt: leanConv.expiresAt
  };

  const rec = await mongoAiConversationRepository.upsert(input);

  expect(rec).toBeTruthy();
  expect(rec.id).toBe(CONV_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(capturedFilter).toStrictEqual({ userId: USER_OID, conversationId: "conv-abc-123" });
  expect((capturedUpdate as Record<string, unknown>).$set).toBeTruthy();
  expect((capturedOpts as Record<string, unknown>).upsert).toBe(true);
  expect((capturedOpts as Record<string, unknown>).new).toBe(true);
});

test("upsert: $set includes assistantId, messages, memory, expiresAt", async () => {
  let capturedUpdate: unknown;
  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate
  );

  const input = {
    userId: USER_OID,
    conversationId: "conv-abc-123",
    assistantId: "oshri",
    messages: leanConv.messages,
    memory: leanConv.memory,
    expiresAt: leanConv.expiresAt
  };

  await mongoAiConversationRepository.upsert(input);

  const setClause = (capturedUpdate as { $set?: Record<string, unknown> }).$set ?? {};
  expect(setClause.assistantId).toBe("oshri");
  expect(setClause.messages).toStrictEqual(leanConv.messages);
  expect(setClause.memory).toStrictEqual(leanConv.memory);
  expect(setClause.expiresAt).toBeInstanceOf(Date);
});

test("upsert: passes session when tx context is provided", async () => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, _u: unknown, opts: unknown) => {
      capturedOpts = opts;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate
  );

  await mongoAiConversationRepository.upsert(
    {
      userId: USER_OID,
      conversationId: "conv-abc-123",
      assistantId: "oshri",
      messages: leanConv.messages,
      memory: leanConv.memory,
      expiresAt: leanConv.expiresAt
    },
    fakeSession
  );

  expect((capturedOpts as Record<string, unknown>).session).toBe(fakeSession);
});

test("upsert: messages array passes through unchanged", async () => {
  const customMessages = [{ role: "user", content: "transfer 100 to bob", createdAt: new Date() }];
  let capturedUpdate: unknown;
  const returnedDoc = { ...leanConv, messages: customMessages, toObject: () => ({ ...leanConv, messages: customMessages }) };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate
  );

  const rec = await mongoAiConversationRepository.upsert({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    assistantId: "oshri",
    messages: customMessages,
    memory: leanConv.memory,
    expiresAt: leanConv.expiresAt
  });

  const setClause = (capturedUpdate as { $set?: Record<string, unknown> }).$set ?? {};
  expect(setClause.messages).toStrictEqual(customMessages);
  expect(rec.messages).toStrictEqual(customMessages);
});

test("upsert: memory object passes through unchanged", async () => {
  const customMemory = { turn: 3, lastCounterparty: { email: "alice@example.com", maskedLabel: "a***", firstMentionedAtTurn: 1, lastReferencedAtTurn: 3 }, mentionedCounterparties: [], entities: [], answerFrames: [], pendingConfirmation: null, clarification: null, transferIntentFrame: null, mode: "transfer_draft_in_progress" };
  let capturedUpdate: unknown;
  const returnedDoc = { ...leanConv, memory: customMemory, toObject: () => ({ ...leanConv, memory: customMemory }) };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate
  );

  const rec = await mongoAiConversationRepository.upsert({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    assistantId: "oshri",
    messages: leanConv.messages,
    memory: customMemory,
    expiresAt: leanConv.expiresAt
  });

  const setClause = (capturedUpdate as { $set?: Record<string, unknown> }).$set ?? {};
  expect(setClause.memory).toStrictEqual(customMemory);
  expect(rec.memory).toStrictEqual(customMemory);
});

test("upsert: returns AiConversationRecord without _id", async () => {
  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async () => returnedDoc) as unknown as typeof AiConversation.findOneAndUpdate
  );

  const rec = await mongoAiConversationRepository.upsert({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    assistantId: "oshri",
    messages: leanConv.messages,
    memory: leanConv.memory,
    expiresAt: leanConv.expiresAt
  });

  expect(rec.id).toBe(CONV_OID);
  expect((rec as Record<string, unknown>)._id).toBeUndefined();
  expect(rec.userId).toBe(USER_OID);
  expect(rec.conversationId).toBe("conv-abc-123");
  expect(rec.assistantId).toBe("oshri");
});
