import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { runAssistantGraph } from "../graph.js";
import { createFakeLlmProvider, createFakeConversationStore } from "./_aiSafetyKit3.js";
import { createFakePhaseThreeTransactionTools } from "./_aiSafetyKit2.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";


test("conversation store trims saved messages to the last twenty", async () => {
  const conversationStore = createFakeConversationStore();
  const messages = Array.from({ length: 22 }, (_, index) =>
    index % 2 === 0
      ? new HumanMessage(`message-${index}`)
      : new AIMessage(`message-${index}`)
  );

  await conversationStore.save({
    userId: "507f1f77bcf86cd799439011",
    conversationId: "test-trim",
    assistantId: "oshri",
    messages,
    memory: createEmptyCounterpartyMemory()
  });

  const loaded = await conversationStore.load("507f1f77bcf86cd799439011", "test-trim");

  expect(loaded.messages.length).toBe(20);
  expect(loaded.messages[0].content).toBe("message-2");
});


test("two sequential turns save each user turn exactly once and alternate roles", async () => {
  const conversationStore = createFakeConversationStore();
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "unsupported" }; }
  });
  const runTurn = (message: string) =>
    runAssistantGraph(
      { userId: "507f1f77bcf86cd799439011", conversationId: "test-multi-turn-dedup", message },
      { conversationStore, llmProvider }
    );

  await runTurn("first question");

  const firstSave = conversationStore.saved.at(-1);
  expect(firstSave).toBeTruthy();
  expect(firstSave!.messages.map((m) => m.getType())).toStrictEqual(["human", "ai"]);
  expect(String(firstSave!.messages[0].content)).toBe("first question");

  await runTurn("second question");

  const secondSave = conversationStore.saved.at(-1);
  expect(secondSave).toBeTruthy();
  const roles = secondSave!.messages.map((m) => m.getType());
  const contents = secondSave!.messages.map((m) => String(m.content));

  expect(contents.filter((c) => c === "first question").length).toBe(1);
  expect(contents.filter((c) => c === "second question").length).toBe(1);
  expect(roles).toStrictEqual(["human", "ai", "human", "ai"]);
  expect(contents[0]).toBe("first question");
  expect(contents[2]).toBe("second question");
});

test("clarification resume turn does not re-append the prior user message", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore();

  await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-clarification-resume-dedup", message: "Tell me more about which transaction" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-clarification-resume-dedup", message: "the second one" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  const finalSave = conversationStore.saved.at(-1);
  expect(finalSave).toBeTruthy();
  const roles = finalSave!.messages.map((m) => m.getType());
  const contents = finalSave!.messages.map((m) => String(m.content));

  expect(contents.filter((c) => c === "Tell me more about which transaction").length).toBe(1);
  expect(contents.filter((c) => c === "the second one").length).toBe(1);
  for (let index = 1; index < roles.length; index += 1) {
    expect(!(roles[index] === "human" && roles[index - 1] === "human")).toBe(true);
  }
});
