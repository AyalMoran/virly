import {
  getReadOnlyToolsForIntent,
  intentToReadOnlyTools,
  isReadOnlyToolName
} from "../router.js";
import {
  createFakeTools,
  createFakeLlmProvider,
  createFakeConversationStore,
  createFakeTransferPreparationService,
  createFakeTransferModificationService,
  collectGraphNodeTransitions
} from "./_aiSafetyKit3.js";
import { createFakePhaseFourTransferTools } from "./_aiSafetyKit4.js";
import { createEmptyCounterpartyMemory } from "../counterpartyMemory.js";

test("read-only route map preserves existing implemented tool routing", () => {
  expect(getReadOnlyToolsForIntent("balance_inquiry")).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
  expect(getReadOnlyToolsForIntent("recent_transactions")).toStrictEqual(["getRecentTransactions"]);
  expect(getReadOnlyToolsForIntent("last_sent_counterparty")).toStrictEqual(["getLastSentCounterparty"]);
  expect(getReadOnlyToolsForIntent("transfer_prepare")).toStrictEqual([]);
  expect(getReadOnlyToolsForIntent("transfer_modify_pending")).toStrictEqual([]);
  expect(getReadOnlyToolsForIntent("unsafe_request")).toStrictEqual([]);
});

test("read-only graph route skips transfer preparation and pending modification services", async () => {
  const executed: string[] = [];
  const transferPreparations: Array<any> = [];
  const modifications: Array<any> = [];
  const { result, nodeNames } = await collectGraphNodeTransitions(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "test-routing-read-only-skips-transfer-services",
      requestId: "request-routing-read-only-skips-transfer-services",
      message: "What is my balance?"
    },
    {
      tools: createFakeTools(executed),
      transferPreparationService: createFakeTransferPreparationService(transferPreparations),
      transferModificationService: createFakeTransferModificationService(modifications)
    }
  );

  expect(result.intent).toBe("balance_inquiry");
  expect(result.toolCalls).toStrictEqual(["getUserAccounts", "getAccountBalance"]);
  expect(transferPreparations.length).toBe(0);
  expect(modifications.length).toBe(0);
  expect(nodeNames.includes("routeReadOnlyTools")).toBeTruthy();
  expect(nodeNames.includes("extractTransferDraft")).toBe(false);
  expect(nodeNames.includes("prepareTransferConfirmation")).toBe(false);
  expect(nodeNames.includes("modifyPendingTransferConfirmation")).toBe(false);
});

test("transfer preparation route skips generic read-only tool flow", async () => {
  const executed: string[] = [];
  const transferPreparations: Array<any> = [];
  const llmProvider = createFakeLlmProvider({
    async classifyIntent() { return { intent: "transfer_prepare" }; },
    async extractTransferDraft() { return { recipientEmail: "alex@example.com", amount: 25, currency: "ILS", currencyMentioned: true, currencySupported: true }; }
  });
  const { result, nodeNames } = await collectGraphNodeTransitions(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "test-routing-transfer-skips-read-only-flow",
      requestId: "request-routing-transfer-skips-read-only-flow",
      message: "Send alex@example.com 25 shekels"
    },
    {
      tools: createFakeTools(executed),
      llmProvider,
      transferPreparationService: createFakeTransferPreparationService(transferPreparations)
    }
  );

  expect(result.intent).toBe("transfer_prepare");
  expect(result.confirmation?.status).toBe("pending");
  expect(result.toolCalls).toStrictEqual([]);
  expect(executed).toStrictEqual([]);
  expect(transferPreparations.length).toBe(1);
  expect(nodeNames.includes("extractTransferDraft")).toBeTruthy();
  expect(nodeNames.includes("prepareTransferConfirmation")).toBeTruthy();
  expect(nodeNames.includes("routeReadOnlyTools")).toBe(false);
  expect(nodeNames.includes("modifyPendingTransferConfirmation")).toBe(false);
});

test("pending confirmation chat route remains read-only and skips transfer services", async () => {
  const executed: string[] = [];
  const transferPreparations: Array<any> = [];
  const modifications: Array<any> = [];
  const conversationStore = createFakeConversationStore({
    messages: [],
    memory: {
      ...createEmptyCounterpartyMemory(),
      pendingConfirmation: {
        confirmationId: "pending-transfer-1",
        type: "transfer",
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        recipientEmail: "alex@example.com",
        amount: 50,
        currency: "ILS",
        turnCreated: 1,
        version: 1
      },
      mode: "transfer_confirmation_pending"
    }
  });
  const { result, nodeNames } = await collectGraphNodeTransitions(
    {
      userId: "507f1f77bcf86cd799439011",
      conversationId: "test-routing-chat-confirmation-read-only",
      requestId: "request-routing-chat-confirmation-read-only",
      message: "Yes, confirm it"
    },
    {
      tools: createFakePhaseFourTransferTools(executed),
      conversationStore,
      transferPreparationService: createFakeTransferPreparationService(transferPreparations),
      transferModificationService: createFakeTransferModificationService(modifications)
    }
  );

  expect(result.intent).toBe("pending_confirmation_status");
  expect(result.toolCalls).toStrictEqual([]);
  expect(executed).toStrictEqual([]);
  expect(transferPreparations.length).toBe(0);
  expect(modifications.length).toBe(0);
  expect(nodeNames.includes("routeReadOnlyTools")).toBeTruthy();
  expect(nodeNames.includes("prepareTransferConfirmation")).toBe(false);
  expect(nodeNames.includes("modifyPendingTransferConfirmation")).toBe(false);
  expect(result.message).toMatch(/use its Confirm or Deny button/i);
});

test("read-only route map includes planned phase one tool routes", () => {
  expect(getReadOnlyToolsForIntent("recent_sent_counterparties")).toStrictEqual(["getRecentSentCounterparties"]);
  expect(getReadOnlyToolsForIntent("counterparty_summary")).toStrictEqual(["resolveCounterpartyCandidates", "getCounterpartySummary"]);
  expect(getReadOnlyToolsForIntent("transaction_detail")).toStrictEqual(["resolveTransactionReference", "getTransactionReceipt"]);
  expect(getReadOnlyToolsForIntent("transfer_eligibility")).toStrictEqual(["getTransferEligibility"]);
  expect(getReadOnlyToolsForIntent("pending_ai_transfers")).toStrictEqual(["getPendingAiTransfers"]);
});

test("every configured read-only route uses an allowlisted tool name", () => {
  for (const toolNames of Object.values(intentToReadOnlyTools)) {
    for (const toolName of toolNames) {
      expect(isReadOnlyToolName(toolName)).toBe(true);
    }
  }
});
