import { runAssistantGraph } from "../graph.js";
import { createFakeTools, createFakeLlmProvider, createFakeConversationStore, createMemoryWithCounterparties } from "./_aiSafetyKit3.js";
import { AIMessage } from "@langchain/core/messages";
import type { AssistantId } from "../assistants.js";
import type { RunAssistantResult } from "../state.js";

test("balance query calls only read balance tools", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-balance", message: "What is my balance?" },
    { tools: createFakeTools(executed) }
  );

  expect(result.intent).toBe("balance_inquiry");
  expect(result.toolCalls).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
  expect(executed).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
});

test("llm classifier can map natural wording to an approved intent", async () => {
  const executed: string[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "recent_transactions" }; },
    async composeResponse(input) { return `LLM response: ${input.fallbackMessage}`; }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-llm-classifier", message: "Could you recap my latest card activity?" },
    { tools: createFakeTools(executed), llmProvider }
  );

  expect(result.intent).toBe("recent_transactions");
  expect(result.toolCalls).toStrictEqual(["getRecentTransactions"]);
  expect(result.message.startsWith("LLM response:")).toBe(true);
});

test("assistant personality changes wording without changing tools", async () => {
  const assistantIds: AssistantId[] = ["oshri", "chaya", "yehuda", "yohai"];
  const results: RunAssistantResult[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "balance_inquiry" }; },
    async composeResponse(input) { return `${input.assistantId}: ${input.fallbackMessage}`; }
  });

  for (const assistantId of assistantIds) {
    const executed: string[] = [];
    const result = await runAssistantGraph(
      { userId: "507f1f77bcf86cd799439011", conversationId: `test-personality-${assistantId}`, assistantId, message: "What is my balance?" },
      { tools: createFakeTools(executed), llmProvider }
    );

    expect(result.toolCalls).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
    expect(executed).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
    results.push(result);
  }

  expect(results.map((r) => r.intent)).toStrictEqual(assistantIds.map(() => "balance_inquiry"));
  expect(results.map((r) => r.assistantId)).toStrictEqual(assistantIds);
  expect(new Set(results.map((r) => r.message)).size).toBe(4);
});

test("recent transactions query calls only read transaction tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transactions", message: "Show my recent transactions" },
    { tools: createFakeTools(executed) }
  );

  expect(result.intent).toBe("recent_transactions");
  expect(result.toolCalls).toStrictEqual(["getRecentTransactions"]);
  expect(executed).toStrictEqual(["getRecentTransactions"]);
});

test("last sent counterparty is stored and later resolved as this person", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore();

  const firstResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-counterparty-context", message: "Who is the last person I sent money to?" },
    { tools: createFakeTools(executed), conversationStore }
  );

  expect(firstResult.intent).toBe("last_sent_counterparty");
  expect(firstResult.toolCalls).toStrictEqual(["getLastSentCounterparty"]);
  expect(firstResult.message).toMatch(/alex@example\.com/);
  expect(firstResult.message).not.toMatch(/a\*\*\*@example\.com/);
  expect(conversationStore.saved.at(-1)?.memory.lastCounterparty?.email).toBe("alex@example.com");

  const secondResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-counterparty-context", message: "What are my last 5 transactions with this person?" },
    { tools: createFakeTools(executed), conversationStore }
  );

  expect(secondResult.intent).toBe("counterparty_transactions");
  expect(secondResult.toolCalls).toStrictEqual(["getTransactionsWithCounterparty"]);
  expect(executed.includes("getTransactionsWithCounterparty:alex@example.com")).toBeTruthy();
});

test("first person reference resolves by first mention order", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: createMemoryWithCounterparties(["alex@example.com", "rani@example.com"])
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-first-person", message: "How much did I ever send to the first person we talked about?" },
    { tools: createFakeTools(executed), conversationStore }
  );

  expect(result.intent).toBe("counterparty_total_sent");
  expect(result.toolCalls).toStrictEqual(["getTotalSentToCounterparty"]);
  expect(executed.includes("getTotalSentToCounterparty:alex@example.com")).toBeTruthy();
});

test("received-total follow-up is read-only and resolves from memory", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: createMemoryWithCounterparties(["alex@example.com"])
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-received-total-follow-up", message: "How much did he send me?" },
    { tools: createFakeTools(executed), conversationStore }
  );

  expect(result.intent).toBe("counterparty_total_received");
  expect(result.toolCalls).toStrictEqual(["getTotalReceivedFromCounterparty"]);
  expect(executed.includes("getTotalReceivedFromCounterparty:alex@example.com")).toBeTruthy();
});

test("named received-total request resolves counterparty before total tool", async () => {
  const executed: string[] = [];
  const { createFakePhaseTwoCounterpartyTools } = await import("./_aiSafetyKit2.js");
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-named-received-total", message: "How much has Daniel paid me?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("counterparty_total_received");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getTotalReceivedFromCounterparty"]);
  expect(executed.includes("resolveCounterpartyCandidates")).toBeTruthy();
  expect(executed.includes("getTotalReceivedFromCounterparty:daniel@example.com")).toBeTruthy();
});

test("net-total follow-up is read-only and resolves from memory", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: createMemoryWithCounterparties(["alex@example.com"])
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-net-total-follow-up", message: "What is the net between me and him?" },
    { tools: createFakeTools(executed), conversationStore }
  );

  expect(result.intent).toBe("counterparty_net_total");
  expect(result.toolCalls).toStrictEqual(["getNetWithCounterparty"]);
  expect(executed.includes("getNetWithCounterparty:alex@example.com")).toBeTruthy();
});

test("named net-total request resolves counterparty before net tool", async () => {
  const executed: string[] = [];
  const { createFakePhaseTwoCounterpartyTools } = await import("./_aiSafetyKit2.js");
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-named-net-total", message: "What is my net with Daniel?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("counterparty_net_total");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getNetWithCounterparty"]);
  expect(executed.includes("resolveCounterpartyCandidates")).toBeTruthy();
  expect(executed.includes("getNetWithCounterparty:daniel@example.com")).toBeTruthy();
});

test("read-only total answers persist total entity and answer-frame query context", async () => {
  const executed: string[] = [];
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: createMemoryWithCounterparties(["alex@example.com"])
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-total-answer-memory", message: "What is the net between me and him?" },
    { tools: createFakeTools(executed), conversationStore }
  );
  const savedMemory = conversationStore.saved.at(-1)?.memory;
  const totalEntity = savedMemory?.entities?.find((e) => e.id === "total:net:alex@example.com");
  const answerFrame = savedMemory?.answerFrames?.at(-1);

  expect(result.intent).toBe("counterparty_net_total");
  expect(totalEntity?.type).toBe("total");
  expect(totalEntity?.counterpartyEmail).toBe("alex@example.com");
  expect(totalEntity?.direction).toBe("net");
  expect(totalEntity?.amount).toBe(15);
  expect(totalEntity?.sourceToolName).toBe("getNetWithCounterparty");
  expect(answerFrame?.queryContext).toStrictEqual({ counterpartyEmail: "alex@example.com", direction: "both", amountRole: "total" });
  expect(answerFrame?.primaryEntities.includes("total:net:alex@example.com")).toBeTruthy();
});

test("llm sees masked assistant context and masked tool summaries while the user sees full emails", async () => {
  const executed: string[] = [];
  let llmToolSummary = "";
  let llmConversationSummary = "";
  const { sanitizeMessagesForLlm } = await import("../llm.js");
  const sanitizedMessages = sanitizeMessagesForLlm([{ role: "assistant", content: "The last person you sent money to was alex@example.com." }]);
  const conversationStore = createFakeConversationStore({
    messages: [new AIMessage("The last person you sent money to was alex@example.com.")],
    memory: createMemoryWithCounterparties(["alex@example.com"])
  });
  const { createFakePhaseTwoCounterpartyTools } = await import("./_aiSafetyKit2.js");
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "recent_sent_counterparties" }; },
    async composeResponse(input) {
      llmToolSummary = input.safeToolSummaries[0]?.summary ?? "";
      llmConversationSummary = input.safeConversationSummary.recentMessages[0]?.content ?? "";
      return `LLM response: ${llmToolSummary}`;
    }
  });

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-llm-mask-and-hydrate", message: "Who are the last 3 people I sent money to?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed), conversationStore, llmProvider }
  );

  expect(sanitizedMessages[0]?.content ?? "").toMatch(/a\*\*\*@example\.com/);
  expect(sanitizedMessages[0]?.content ?? "").not.toMatch(/alex@example\.com/);
  expect(llmConversationSummary).toMatch(/a\*\*\*@example\.com/);
  expect(llmConversationSummary).not.toMatch(/alex@example\.com/);
  expect(llmToolSummary).toMatch(/d\*\*\*@example\.com/);
  expect(llmToolSummary).not.toMatch(/daniel@example\.com/);
  expect(result.message).toMatch(/daniel@example\.com/);
  expect(result.message).not.toMatch(/d\*\*\*@example\.com/);
});
