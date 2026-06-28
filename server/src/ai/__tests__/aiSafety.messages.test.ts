import { runAssistantGraph } from "../graph.js";
import { createFakeLlmProvider, createFakeTools } from "./_aiSafetyKit3.js";
import { createFakePhaseTwoCounterpartyTools } from "./_aiSafetyKit2.js";
import { fakeResult } from "./_aiSafetyKit1.js";
import {
  buildAiUserRequest,
  extractRequestSlots,
  normalizeUserMessage
} from "../messageNormalization.js";
import type { ToolContext } from "../state.js";

test("phase 3 user request captures read-only received-total pronouns", () => {
  const normalizedMessage = normalizeUserMessage("how much did he send me?");
  const requestSlots = extractRequestSlots(normalizedMessage.originalText, "counterparty_total_received");
  const userRequest = buildAiUserRequest(normalizedMessage, requestSlots);

  expect(userRequest.intent).toBe("counterparty_total_received");
  expect(userRequest.language).toBe("en");
  expect(userRequest.operation).toBe("read");
  expect(userRequest.direction).toBe("received");
  expect(userRequest.counterpartyRef?.kind).toBe("pronoun");
  expect(userRequest.counterpartyRef?.rawText.toLowerCase()).toBe("he");
});

test("phase 3 user request captures contextual transfer amount references", () => {
  const normalizedMessage = normalizeUserMessage("send him the same amount he sent me");
  const requestSlots = extractRequestSlots(normalizedMessage.originalText, "transfer_prepare");
  const userRequest = buildAiUserRequest(normalizedMessage, requestSlots);

  expect(userRequest.intent).toBe("transfer_prepare");
  expect(userRequest.operation).toBe("prepare_transfer");
  expect(userRequest.counterpartyRef?.kind).toBe("pronoun");
  expect(userRequest.counterpartyRef?.rawText.toLowerCase()).toBe("him");
  expect(userRequest.amountRef?.kind).toBe("same_as_last_received_from_counterparty");
  expect(userRequest.amountRef?.value).toBeNull();
});

test("graph passes phase 3 user request to read-only tools without public response changes", async () => {
  const seenRequests: Array<NonNullable<ToolContext["userRequest"]>> = [];
  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "test-phase-three-user-request-tool-context",
      message: "show my recent transactions"
    },
    {
      tools: {
        async getRecentTransactions(context: ToolContext) {
          if (context.userRequest) {
            seenRequests.push(context.userRequest);
          }
          return fakeResult({
            toolName: "getRecentTransactions",
            summary: "No recent transactions found.",
            status: "empty",
            metadata: { recordCount: 0 }
          });
        }
      }
    }
  );

  expect(result.intent).toBe("recent_transactions");
  expect(result.toolCalls).toStrictEqual(["getRecentTransactions"]);
  expect(seenRequests.length).toBe(1);
  expect(seenRequests[0].intent).toBe("recent_transactions");
  expect(seenRequests[0].operation).toBe("read");
  expect("userRequest" in result).toBe(false);
});

test("planned but unimplemented tools fail closed in graph execution", async () => {
  const executed: string[] = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "recent_sent_counterparties" }; }
  });

  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "test-planned-tool-fail-closed",
      message: "Who are the last 3 people I sent money to?"
    },
    { tools: createFakeTools(executed), llmProvider }
  );

  expect(result.intent).toBe("recent_sent_counterparties");
  expect(result.toolCalls).toStrictEqual([]);
  expect(executed).toStrictEqual([]);
  expect(result.message).toMatch(/not available yet/i);
});

test("recent sent counterparties request calls phase two sent counterparty tool", async () => {
  const executed: string[] = [];
  const { createFakeConversationStore } = await import("./_aiSafetyKit3.js");
  const conversationStore = createFakeConversationStore();
  const result = await runAssistantGraph(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "test-recent-sent-counterparties",
      message: "Who are the last 3 people I sent money to?"
    },
    { tools: createFakePhaseTwoCounterpartyTools(executed), conversationStore }
  );

  expect(result.intent).toBe("recent_sent_counterparties");
  expect(result.toolCalls).toStrictEqual(["getRecentSentCounterparties"]);
  expect(executed).toStrictEqual(["getRecentSentCounterparties"]);
  expect(result.message).toMatch(/Daniel Example/);
  expect(result.message).toMatch(/daniel@example\.com/);
  expect(result.message).not.toMatch(/d\*\*\*@example\.com/);
  expect(conversationStore.saved.at(-1)?.memory.lastCounterparty?.email).toBe("rani@example.com");
});
