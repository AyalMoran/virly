import { runAssistantGraph } from "../graph.js";
import {
  createFakeTools,
  createFakeLlmProvider,
  createFakeConversationStore,
  createMemoryWithCounterparties
} from "./_aiSafetyKit3.js";
import { createFakePhaseTwoCounterpartyTools } from "./_aiSafetyKit2.js";
import { AIMessage } from "@langchain/core/messages";
import {
  createEmptyCounterpartyMemory,
  rememberCounterparty,
  resolveCounterpartyReferenceDeterministic
} from "../counterpartyMemory.js";

test("llm resolver handles hebrew counterparty references before deterministic fallback", async () => {
  const executed: string[] = [];
  let resolverCalls = 0;
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: createMemoryWithCounterparties(["alex@example.com"])
  });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "counterparty_transactions" }; },
    async resolveCounterpartyReference() {
      resolverCalls += 1;
      return { kind: "last_counterparty", confidence: "high" };
    }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-reference", message: "מה היו 5 העסקאות האחרונות שלי איתו?" },
    { tools: createFakeTools(executed), conversationStore, llmProvider }
  );

  expect(resolverCalls).toBe(1);
  expect(result.intent).toBe("counterparty_transactions");
  expect(result.toolCalls).toStrictEqual(["getTransactionsWithCounterparty"]);
  expect(executed.includes("getTransactionsWithCounterparty:alex@example.com")).toBeTruthy();
});

test("hebrew total-sent follow-up is read-only and calls total counterparty tool", async () => {
  const executed: string[] = [];
  let classifierSawConversationContext = false;
  const conversationStore = createFakeConversationStore({
    messages: [new AIMessage("האחרון שאליו העברת כסף היה alex@example.com.")],
    memory: createMemoryWithCounterparties(["alex@example.com"])
  });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent(input) {
      classifierSawConversationContext = input.messages.length > 1 && input.counterpartyMemory.lastCounterparty?.email === "alex@example.com";
      return { intent: "counterparty_total_sent" };
    },
    async resolveCounterpartyReference() { return { kind: "last_counterparty", confidence: "high" }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-total-reference", message: "כמה כסף העברתי לו?" },
    { tools: createFakeTools(executed), conversationStore, llmProvider }
  );

  expect(classifierSawConversationContext).toBe(true);
  expect(result.intent).toBe("counterparty_total_sent");
  expect(result.toolCalls).toStrictEqual(["getTotalSentToCounterparty"]);
  expect(executed.includes("getTotalSentToCounterparty:alex@example.com")).toBeTruthy();
});

test("phase 12 hebrew read-only follow-ups resolve sent and received totals from memory", async () => {
  const sentExecuted: string[] = [];
  const sentConversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent(input) {
      return { intent: input.userMessage === "כמה שלחתי לו?" ? "counterparty_total_sent" : "counterparty_total_received" };
    },
    async resolveCounterpartyReference() { return { kind: "last_counterparty", confidence: "high" }; }
  });
  const sentResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-phase-12-total-sent", message: "כמה שלחתי לו?" },
    { tools: createFakeTools(sentExecuted), conversationStore: sentConversationStore, llmProvider }
  );
  const receivedExecuted: string[] = [];
  const receivedConversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const receivedResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-phase-12-total-received", message: "כמה הוא שלח לי?" },
    { tools: createFakeTools(receivedExecuted), conversationStore: receivedConversationStore, llmProvider }
  );

  expect(sentResult.intent).toBe("counterparty_total_sent");
  expect(sentResult.toolCalls).toStrictEqual(["getTotalSentToCounterparty"]);
  expect(sentExecuted.includes("getTotalSentToCounterparty:alex@example.com")).toBeTruthy();
  expect(receivedResult.intent).toBe("counterparty_total_received");
  expect(receivedResult.toolCalls).toStrictEqual(["getTotalReceivedFromCounterparty"]);
  expect(receivedExecuted.includes("getTotalReceivedFromCounterparty:alex@example.com")).toBeTruthy();
});

test("phase 12 read-only phrasing resolves net and activity follow-ups from memory", async () => {
  const netExecuted: string[] = [];
  const netConversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const netResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-phase-12-net-with-him", message: "what is my net with him?" },
    { tools: createFakeTools(netExecuted), conversationStore: netConversationStore }
  );
  const activityExecuted: string[] = [];
  const activityConversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const activityLlmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "counterparty_activity_timeline" }; },
    async resolveCounterpartyReference() { return { kind: "last_counterparty", confidence: "high" }; }
  });
  const activityResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-phase-12-activity-with-him", message: "show activity with him" },
    { tools: createFakePhaseTwoCounterpartyTools(activityExecuted), conversationStore: activityConversationStore, llmProvider: activityLlmProvider }
  );

  expect(netResult.intent).toBe("counterparty_net_total");
  expect(netResult.toolCalls).toStrictEqual(["getNetWithCounterparty"]);
  expect(netExecuted.includes("getNetWithCounterparty:alex@example.com")).toBeTruthy();
  expect(activityResult.intent).toBe("counterparty_activity_timeline");
  expect(activityResult.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartyActivityTimeline"]);
  expect(activityExecuted.includes("resolveCounterpartyCandidates")).toBeTruthy();
  expect(activityExecuted.includes("getCounterpartyActivityTimeline:daniel@example.com")).toBeTruthy();
});

test("full email follow-up resolves from remembered counterparty context", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "counterparty_transactions" }; },
    async resolveCounterpartyReference() { return { kind: "named_counterparty", confidence: "high", query: "alex@example.com" }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-full-email-follow-up", message: "Show me my transactions with alex@example.com" },
    { tools: createFakeTools(executed), conversationStore, llmProvider }
  );

  expect(result.intent).toBe("counterparty_transactions");
  expect(result.toolCalls).toStrictEqual(["getTransactionsWithCounterparty"]);
  expect(executed.includes("getTransactionsWithCounterparty:alex@example.com")).toBeTruthy();
});

test("local-part follow-up resolves from remembered counterparty aliases when unambiguous", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({ messages: [], memory: createMemoryWithCounterparties(["alex@example.com"]) });
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "counterparty_transactions" }; },
    async resolveCounterpartyReference() { return { kind: "named_counterparty", confidence: "high", query: "alex" }; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-local-part-follow-up", message: "Show me my transactions with alex" },
    { tools: createFakeTools(executed), conversationStore, llmProvider }
  );

  expect(result.intent).toBe("counterparty_transactions");
  expect(result.toolCalls).toStrictEqual(["getTransactionsWithCounterparty"]);
  expect(executed.includes("getTransactionsWithCounterparty:alex@example.com")).toBeTruthy();
});

test("llm responder input includes deterministic required amount facts", async () => {
  const executed: string[] = [];
  let requiredResponseFacts: Array<{ source: string; value: string }> = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "balance_inquiry" }; },
    async composeResponse(input) {
      requiredResponseFacts = input.requiredResponseFacts.map((fact) => ({ source: fact.source, value: fact.value }));
      return input.fallbackMessage;
    }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-required-response-facts", message: "What is my balance?" },
    { tools: createFakeTools(executed), llmProvider }
  );

  expect(result.intent).toBe("balance_inquiry");
  expect(result.toolCalls).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
  expect(requiredResponseFacts).toStrictEqual([{ source: "getAccountBalance.amount", value: "125.00" }]);
});

test("counterparty memory keeps eight entries and evicts least recently referenced", async () => {
  const memory = createMemoryWithCounterparties(["alex@example.com", "rani@example.com", "dan@example.com", "noa@example.com", "eli@example.com"]);
  const refreshed = rememberCounterparty(memory, { email: "alex@example.com", maskedLabel: "a***@example.com", firstMentionedAtTurn: 1, lastReferencedAtTurn: 6 }, 6);
  const withSixth = rememberCounterparty(refreshed, { email: "ron@example.com", maskedLabel: "r***@example.com", firstMentionedAtTurn: 7, lastReferencedAtTurn: 7 }, 7);

  expect(withSixth.mentionedCounterparties.length).toBe(6);
  expect(withSixth.mentionedCounterparties.some((c) => c.email === "rani@example.com")).toBe(true);
  expect(withSixth.lastCounterparty?.email).toBe("ron@example.com");
});

test("deterministic counterparty resolver handles english pronouns from memory", () => {
  const memory = rememberCounterparty(
    createEmptyCounterpartyMemory(),
    { email: "alex@example.com", maskedLabel: "a***@example.com", userLabel: "Alex Example (alex@example.com)", displayName: "Alex Example", firstMentionedAtTurn: 1, lastReferencedAtTurn: 1 },
    1
  );

  expect(resolveCounterpartyReferenceDeterministic("how much did he send me?", memory)?.email).toBe("alex@example.com");
  expect(resolveCounterpartyReferenceDeterministic("send it to the same recipient", memory)?.email).toBe("alex@example.com");
});

test("ambiguous counterparty reference asks for clarification and runs no tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-ambiguous-reference", message: "What are my last 5 transactions with this person?" },
    { tools: createFakeTools(executed), conversationStore: createFakeConversationStore() }
  );

  expect(result.intent).toBe("counterparty_transactions");
  expect(result.toolCalls).toStrictEqual([]);
  expect(result.message).toBe("Which recipient should I use for that question?");
  expect(result.clarification).toStrictEqual({ reason: "ambiguous_reference", message: "Which recipient should I use for that question?", expectedReplyType: "recipient" });
  expect(result.toolResults).toStrictEqual([]);
  expect(executed).toStrictEqual([]);
});

test("read-only graph result exposes only minimal public tool result statuses", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-public-tool-results", message: "Who are the last 3 people I sent money to?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed), conversationStore: createFakeConversationStore() }
  );

  expect(result.intent).toBe("recent_sent_counterparties");
  expect(result.toolResults).toStrictEqual([{ toolName: "getRecentSentCounterparties", status: "ok" }]);
  expect(JSON.stringify(result.toolResults).includes("daniel@example.com")).toBe(false);
});
