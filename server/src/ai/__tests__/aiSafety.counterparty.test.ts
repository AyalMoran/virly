import { runAssistantGraph } from "../graph.js";
import { createFakeLlmProvider } from "./_aiSafetyKit3.js";
import {
  createFakePhaseTwoCounterpartyTools,
  createFakePhaseThreeTransactionTools
} from "./_aiSafetyKit2.js";
import { buildTransactionFilterCriteria, getReasonQueryFromMessage } from "../tools/transactionHelpers.js";

test("recent received counterparties request calls phase two received counterparty tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-recent-received-counterparties", message: "Who sent me money recently?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("recent_received_counterparties");
  expect(result.toolCalls).toStrictEqual(["getRecentReceivedCounterparties"]);
  expect(executed).toStrictEqual(["getRecentReceivedCounterparties"]);
  expect(result.message).toMatch(/Sarah Example/);
  expect(result.message).toMatch(/sarah@example\.com/);
});

test("counterparty summary resolves candidate before running summary tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-counterparty-summary", message: "What's my history with Daniel?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("counterparty_summary");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartySummary"]);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartySummary:daniel@example.com"]);
  expect(result.message).toMatch(/sent 70\.00 ILS/);
});

test("ambiguous counterparty summary stops before downstream summary tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-ambiguous-counterparty-summary", message: "What's my history with ambiguous Daniel?" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("counterparty_summary");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates"]);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates"]);
  expect(result.message).toMatch(/multiple matching counterparties/i);
  expect(result.clarification?.options?.map((o) => o.label)).toStrictEqual([
    "Daniel A (daniel.a@example.com)",
    "Daniel B (daniel.b@example.net)"
  ]);
});

test("counterparty activity timeline resolves candidate before running timeline tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-counterparty-activity", message: "Show activity with Daniel" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("counterparty_activity_timeline");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartyActivityTimeline"]);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartyActivityTimeline:daniel@example.com"]);
  expect(result.message).toMatch(/Recent activity with Daniel Example/);
});

test("hebrew recent counterparty requests route to phase two tools", async () => {
  const sentExecuted: string[] = [];
  const sentResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-recent-sent-counterparties", message: "למי שלחתי כסף לאחרונה?" },
    { tools: createFakePhaseTwoCounterpartyTools(sentExecuted) }
  );
  const receivedExecuted: string[] = [];
  const receivedResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-recent-received-counterparties", message: "מי שלח לי כסף לאחרונה?" },
    { tools: createFakePhaseTwoCounterpartyTools(receivedExecuted) }
  );

  expect(sentResult.intent).toBe("recent_sent_counterparties");
  expect(sentExecuted).toStrictEqual(["getRecentSentCounterparties"]);
  expect(receivedResult.intent).toBe("recent_received_counterparties");
  expect(receivedExecuted).toStrictEqual(["getRecentReceivedCounterparties"]);
});

test("phase 12 read-only today phrasing routes recent counterparty questions", async () => {
  const sentExecuted: string[] = [];
  const sentResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-today-sent-counterparties", message: "who did I send money to today?" },
    { tools: createFakePhaseTwoCounterpartyTools(sentExecuted) }
  );
  const receivedExecuted: string[] = [];
  const receivedResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-today-received-counterparties", message: "who sent me money today?" },
    { tools: createFakePhaseTwoCounterpartyTools(receivedExecuted) }
  );

  expect(sentResult.intent).toBe("recent_sent_counterparties");
  expect(sentExecuted).toStrictEqual(["getRecentSentCounterparties"]);
  expect(receivedResult.intent).toBe("recent_received_counterparties");
  expect(receivedExecuted).toStrictEqual(["getRecentReceivedCounterparties"]);
});

test("phase 12 hebrew today phrasing routes recent counterparty questions", async () => {
  const sentExecuted: string[] = [];
  const sentResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-today-sent-counterparties", message: "למי העברתי היום?" },
    { tools: createFakePhaseTwoCounterpartyTools(sentExecuted) }
  );
  const receivedExecuted: string[] = [];
  const receivedResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-today-received-counterparties", message: "מי העביר לי היום?" },
    { tools: createFakePhaseTwoCounterpartyTools(receivedExecuted) }
  );

  expect(sentResult.intent).toBe("recent_sent_counterparties");
  expect(sentExecuted).toStrictEqual(["getRecentSentCounterparties"]);
  expect(receivedResult.intent).toBe("recent_received_counterparties");
  expect(receivedExecuted).toStrictEqual(["getRecentReceivedCounterparties"]);
});

test("mixed hebrew english counterparty summary still resolves and executes", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-mixed-counterparty-summary", message: "תראה לי history with Daniel" },
    { tools: createFakePhaseTwoCounterpartyTools(executed) }
  );

  expect(result.intent).toBe("counterparty_summary");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartySummary"]);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartySummary:daniel@example.com"]);
});

test("transaction search routes to filtered transaction search tool", async () => {
  const executed: string[] = [];
  const { createFakeConversationStore } = await import("./_aiSafetyKit3.js");
  const conversationStore = createFakeConversationStore();
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-search", message: "Show transfers over 100 from last week" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  expect(result.intent).toBe("transaction_search");
  expect(result.toolCalls).toStrictEqual(["searchTransactions"]);
  expect(executed).toStrictEqual(["searchTransactions"]);
  expect(result.message).toMatch(/over 100\.00 ILS/);
  expect(conversationStore.saved.at(-1)?.memory.entities?.filter((e) => e.type === "transaction").map((e) => e.transactionId)).toStrictEqual(["tx-1", "tx-2"]);
});

test("transaction count routes to transaction stats tool", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-count", message: "How many transactions this month?" },
    { tools: createFakePhaseThreeTransactionTools(executed) }
  );

  expect(result.intent).toBe("transaction_count");
  expect(result.toolCalls).toStrictEqual(["getTransactionStats"]);
  expect(executed).toStrictEqual(["getTransactionStats"]);
  expect(result.message).toMatch(/4 total/);
});

test("transaction detail resolves ordinal from prior transaction memory before receipt lookup", async () => {
  const executed: string[] = [];
  const { createFakeConversationStore } = await import("./_aiSafetyKit3.js");
  const conversationStore = createFakeConversationStore();

  await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-detail-follow-up", message: "Show transfers over 100 from last week" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-detail-follow-up", message: "Tell me more about the second one" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  expect(result.intent).toBe("transaction_detail");
  expect(result.toolCalls).toStrictEqual(["resolveTransactionReference", "getTransactionReceipt"]);
  expect(executed.includes("getTransactionReceipt:tx-2")).toBeTruthy();
  expect(result.message).toMatch(/Transaction details for tx-2/);
});

test("ambiguous transaction detail stops before receipt lookup", async () => {
  const executed: string[] = [];
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-ambiguous-transaction-detail", message: "Tell me more about which transaction" },
    { tools: createFakePhaseThreeTransactionTools(executed) }
  );

  expect(result.intent).toBe("transaction_detail");
  expect(result.toolCalls).toStrictEqual(["resolveTransactionReference"]);
  expect(executed).toStrictEqual(["resolveTransactionReference"]);
  expect(result.message).toMatch(/multiple matching transactions/i);
});

test("transaction detail follow-up resolves from clarification options before broader memory", async () => {
  const executed: string[] = [];
  const { createFakeConversationStore } = await import("./_aiSafetyKit3.js");
  const conversationStore = createFakeConversationStore();

  const ambiguousResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-clarification-follow-up", message: "Tell me more about which transaction" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  expect(ambiguousResult.intent).toBe("transaction_detail");
  expect(ambiguousResult.clarification?.expectedReplyType).toBe("transaction");
  expect(ambiguousResult.toolCalls).toStrictEqual(["resolveTransactionReference"]);

  const followUpResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-clarification-follow-up", message: "the second one" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  expect(followUpResult.intent).toBe("transaction_detail");
  expect(followUpResult.toolCalls).toStrictEqual(["resolveTransactionReference", "getTransactionReceipt"]);
  expect(executed.includes("getTransactionReceipt:tx-2")).toBeTruthy();
});

test("hebrew transaction search and detail requests route to phase three tools", async () => {
  const executed: string[] = [];
  const { createFakeConversationStore } = await import("./_aiSafetyKit3.js");
  const conversationStore = createFakeConversationStore();

  const searchResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-transaction-tools", message: "תראה לי העברות מעל 100 משבוע שעבר" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );
  const detailResult = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-hebrew-transaction-tools", message: "תראה לי את ההעברה השנייה" },
    { tools: createFakePhaseThreeTransactionTools(executed), conversationStore }
  );

  expect(searchResult.intent).toBe("transaction_search");
  expect(detailResult.intent).toBe("transaction_detail");
  expect(executed.includes("searchTransactions")).toBeTruthy();
  expect(executed.includes("getTransactionReceipt:tx-2")).toBeTruthy();
});

test("transaction date phrase does not infer received direction from bare from", () => {
  const criteria = buildTransactionFilterCriteria(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-transaction-filter", message: "Show transactions from last week" },
    { limit: 10 }
  );

  expect(criteria.type).toBeUndefined();
  expect(criteria.dateFrom).toBeTruthy();
  expect(criteria.dateTo).toBeTruthy();
});

test("transaction reason filter stops before common date phrase", () => {
  expect(getReasonQueryFromMessage("Show payments for rent this month")).toBe("rent");
});

test("mixed hebrew english transfer quote keeps explicit preflight behavior", async () => {
  const executed: string[] = [];
  const { createFakePhaseFourTransferTools } = await import("./_aiSafetyKit4.js");
  const result = await runAssistantGraph(
    { userId: "507f1f77bcf86cd799439011", conversationId: "test-mixed-transfer-quote", message: "מה יקרה if I send 50 to Daniel?" },
    {
      tools: createFakePhaseFourTransferTools(executed),
      llmProvider: createFakeLlmProvider({ async classifyIntent() { return { intent: "transfer_quote" }; } })
    }
  );

  expect(result.intent).toBe("transfer_quote");
  expect(result.toolCalls).toStrictEqual(["resolveCounterpartyCandidates", "getTransferQuote"]);
  expect(executed).toStrictEqual(["resolveCounterpartyCandidates", "getTransferQuote:daniel@example.com"]);
});
