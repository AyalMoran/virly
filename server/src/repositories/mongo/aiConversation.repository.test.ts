
// src/repositories/mongo/aiConversation.repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { AiConversation } from "../../models/AiConversation.js";
import { mongoAiConversationRepository } from "./aiConversation.repository.js";

function patch<T extends object, K extends keyof T>(o: T, k: K, v: T[K], t: test.TestContext) {
  const orig = o[k]; o[k] = v; t.after(() => { o[k] = orig; });
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

test("findByConversationId: maps lean doc to AiConversationRecord with string id", async (t) => {
  const fakeChain = { session: () => fakeChain, lean: async () => leanConv };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne,
    t
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");

  assert.ok(rec);
  assert.equal(rec.id, CONV_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined, "must not expose _id");
  assert.equal(rec.userId, USER_OID);
  assert.equal(rec.conversationId, "conv-abc-123");
  assert.equal(rec.assistantId, "oshri");
  assert.deepEqual(rec.messages, leanConv.messages);
  assert.deepEqual(rec.memory, leanConv.memory);
  assert.ok(rec.expiresAt instanceof Date);
  assert.ok(rec.createdAt instanceof Date);
  assert.ok(rec.updatedAt instanceof Date);
});

test("findByConversationId: returns null when not found", async (t) => {
  const fakeChain = { session: () => fakeChain, lean: async () => null };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne,
    t
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  assert.equal(rec, null);
});

test("findByConversationId: queries by userId and conversationId", async (t) => {
  let capturedFilter: unknown;
  const fakeChain = {
    session: () => fakeChain,
    lean: async () => null
  };
  patch(
    AiConversation,
    "findOne",
    ((filter: unknown) => { capturedFilter = filter; return fakeChain; }) as unknown as typeof AiConversation.findOne,
    t
  );

  await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  assert.deepEqual(capturedFilter, { userId: USER_OID, conversationId: "conv-abc-123" });
});

test("findByConversationId: passes session when tx context is provided", async (t) => {
  const fakeSession = { id: "fake-session" };
  let capturedSession: unknown;
  const fakeChain = {
    session: (s: unknown) => { capturedSession = s; return fakeChain; },
    lean: async () => null
  };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne,
    t
  );

  await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123", fakeSession);
  assert.equal(capturedSession, fakeSession);
});

test("findByConversationId: messages array passes through unchanged", async (t) => {
  const specialMessages = [
    { role: "user", content: "hello", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { role: "assistant", content: "hi there", createdAt: new Date("2026-01-01T00:01:00.000Z") }
  ];
  const leanWithMessages = { ...leanConv, messages: specialMessages };
  const fakeChain = { session: () => fakeChain, lean: async () => leanWithMessages };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne,
    t
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  assert.ok(rec);
  assert.deepEqual(rec.messages, specialMessages);
});

test("findByConversationId: memory object passes through unchanged", async (t) => {
  const specialMemory = { turn: 5, lastCounterparty: { email: "bob@example.com" }, mentionedCounterparties: [], entities: [{ foo: "bar" }], answerFrames: [], pendingConfirmation: null, clarification: null, transferIntentFrame: null, mode: "idle" };
  const leanWithMemory = { ...leanConv, memory: specialMemory };
  const fakeChain = { session: () => fakeChain, lean: async () => leanWithMemory };
  patch(
    AiConversation,
    "findOne",
    ((_filter: unknown) => fakeChain) as unknown as typeof AiConversation.findOne,
    t
  );

  const rec = await mongoAiConversationRepository.findByConversationId(USER_OID, "conv-abc-123");
  assert.ok(rec);
  assert.deepEqual(rec.memory, specialMemory);
});

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

test("upsert: calls findOneAndUpdate with userId+conversationId filter, $set body, upsert+new options", async (t) => {
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
    }) as unknown as typeof AiConversation.findOneAndUpdate,
    t
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

  assert.ok(rec);
  assert.equal(rec.id, CONV_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined, "must not expose _id");
  assert.deepEqual(capturedFilter, { userId: USER_OID, conversationId: "conv-abc-123" });
  assert.ok((capturedUpdate as Record<string, unknown>).$set, "update must use $set");
  assert.ok((capturedOpts as Record<string, unknown>).upsert === true, "must use upsert: true");
  assert.ok((capturedOpts as Record<string, unknown>).new === true, "must use new: true");
});

test("upsert: $set includes assistantId, messages, memory, expiresAt", async (t) => {
  let capturedUpdate: unknown;
  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate,
    t
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
  assert.equal(setClause.assistantId, "oshri");
  assert.deepEqual(setClause.messages, leanConv.messages);
  assert.deepEqual(setClause.memory, leanConv.memory);
  assert.ok(setClause.expiresAt instanceof Date);
});

test("upsert: passes session when tx context is provided", async (t) => {
  const fakeSession = { id: "fake-session" };
  let capturedOpts: unknown;
  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, _u: unknown, opts: unknown) => {
      capturedOpts = opts;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate,
    t
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

  assert.equal((capturedOpts as Record<string, unknown>).session, fakeSession);
});

test("upsert: messages array passes through unchanged", async (t) => {
  const customMessages = [{ role: "user", content: "transfer 100 to bob", createdAt: new Date() }];
  let capturedUpdate: unknown;
  const returnedDoc = { ...leanConv, messages: customMessages, toObject: () => ({ ...leanConv, messages: customMessages }) };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate,
    t
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
  assert.deepEqual(setClause.messages, customMessages);
  assert.deepEqual(rec.messages, customMessages);
});

test("upsert: memory object passes through unchanged", async (t) => {
  const customMemory = { turn: 3, lastCounterparty: { email: "alice@example.com", maskedLabel: "a***", firstMentionedAtTurn: 1, lastReferencedAtTurn: 3 }, mentionedCounterparties: [], entities: [], answerFrames: [], pendingConfirmation: null, clarification: null, transferIntentFrame: null, mode: "transfer_draft_in_progress" };
  let capturedUpdate: unknown;
  const returnedDoc = { ...leanConv, memory: customMemory, toObject: () => ({ ...leanConv, memory: customMemory }) };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async (_f: unknown, update: unknown) => {
      capturedUpdate = update;
      return returnedDoc;
    }) as unknown as typeof AiConversation.findOneAndUpdate,
    t
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
  assert.deepEqual(setClause.memory, customMemory);
  assert.deepEqual(rec.memory, customMemory);
});

test("upsert: returns AiConversationRecord without _id", async (t) => {
  const returnedDoc = { ...leanConv, toObject: () => leanConv };
  patch(
    AiConversation,
    "findOneAndUpdate",
    (async () => returnedDoc) as unknown as typeof AiConversation.findOneAndUpdate,
    t
  );

  const rec = await mongoAiConversationRepository.upsert({
    userId: USER_OID,
    conversationId: "conv-abc-123",
    assistantId: "oshri",
    messages: leanConv.messages,
    memory: leanConv.memory,
    expiresAt: leanConv.expiresAt
  });

  assert.equal(rec.id, CONV_OID);
  assert.equal((rec as Record<string, unknown>)._id, undefined);
  assert.equal(rec.userId, USER_OID);
  assert.equal(rec.conversationId, "conv-abc-123");
  assert.equal(rec.assistantId, "oshri");
});
