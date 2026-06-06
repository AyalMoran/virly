import { runAssistantGraph } from "../graph.js";
import { createConfiguredAssistantLlmProvider } from "../llm.js";
import { classifyAmountReference } from "../amountResolution.js";
import { classifyAssistantIntentDeterministic } from "../router.js";
import type {
  AmountResolutionService,
  AssistantLlmProvider,
  AssistantToolExecutors,
  ToolContext
} from "../state.js";
import { createToolResult } from "../toolResults.js";
import { loadAiEvalFixtureFiles } from "./loadFixtures.js";
import { runSeededMongoEvalFixtures } from "./seededMongo.js";
import {
  createInMemoryConversationStore,
  createTransferModificationService,
  createTransferPreparationService
} from "./support.js";
import type { AiEvalFixtureFile, AiEvalScenario, AiEvalTurnExpectation } from "./types.js";

export type AiEvalMode =
  | "deterministic"
  | "llm-dev"
  | "seeded-mongo"
  | "llm-seeded-mongo";

export type AiEvalTurnResult = {
  fixtureSuiteName: string;
  scenarioId: string;
  turnIndex: number;
  userMessage: string;
  passed: boolean;
  failures: string[];
};

export type AiEvalRunSummary = {
  mode: AiEvalMode;
  totalFixtures: number;
  totalScenarios: number;
  totalTurns: number;
  failedTurns: AiEvalTurnResult[];
};

function isLlmDevEvalEnabled() {
  return process.env.VIRLY_AI_EVAL_ENABLE_LLM_DEV?.trim().toLowerCase() === "true";
}

function createConfiguredLlmProviderForEval(
  createConfiguredProvider: (() => AssistantLlmProvider | undefined) | undefined
) {
  if (!isLlmDevEvalEnabled()) {
    throw new Error(
      "Configured LLM eval mode requires VIRLY_AI_EVAL_ENABLE_LLM_DEV=true."
    );
  }

  const configuredProvider =
    createConfiguredProvider?.() ?? createConfiguredAssistantLlmProvider();
  if (!configuredProvider) {
    throw new Error(
      "Configured LLM eval mode requires OPENAI_API_KEY and VIRLY_AI_MODEL."
    );
  }

  return configuredProvider;
}

function fakeResult(input: {
  toolName: Parameters<typeof createToolResult>[0]["toolName"];
  summary: string;
  userSummary?: string;
  metadata?: Parameters<typeof createToolResult>[0]["metadata"];
  status?: "ok" | "empty" | "error";
  data?: unknown;
  memoryUpdates?: Parameters<typeof createToolResult>[0]["memoryUpdates"];
}) {
  return createToolResult({
    toolName: input.toolName,
    status: input.status ?? "ok",
    data: input.data ?? null,
    summary: input.summary,
    userSummary: input.userSummary,
    metadata: input.metadata,
    memoryUpdates: input.memoryUpdates
  });
}

function pendingTransferRowsForScenario(scenario?: AiEvalScenario) {
  const configured = scenario?.setup?.pendingTransfers?.length
    ? scenario.setup.pendingTransfers
    : [
        {
          recipientEmail: "alex@example.com",
          amount: 50,
          currency: "ILS" as const,
          recipientFirstName: "Alex",
          recipientLastName: "Example"
        }
      ];

  return configured.map((pending, index) => {
    const firstName =
      pending.recipientFirstName ?? pending.recipientEmail.split("@")[0] ?? "";
    const lastName = pending.recipientLastName ?? "Example";
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const maskedEmail = `${pending.recipientEmail.slice(0, 1)}***@example.com`;
    const recipientLabel = displayName
      ? `${displayName} (${pending.recipientEmail})`
      : pending.recipientEmail;
    const recipientMaskedLabel = displayName
      ? `${displayName} (${maskedEmail})`
      : maskedEmail;

    return {
      pendingTransferId: `pending-transfer-${index + 1}`,
      label: `${index + 1}. ${pending.amount.toFixed(2)} ${pending.currency} to ${recipientLabel}`,
      llmLabel: `${index + 1}. ${pending.amount.toFixed(2)} ${pending.currency} to ${recipientMaskedLabel}`,
      recipientLabel,
      recipientMaskedLabel,
      recipientEmailMasked: maskedEmail,
      amount: pending.amount,
      currency: pending.currency,
      status: "pending" as const,
      expiresAt: "2026-06-30T12:00:00.000Z"
    };
  });
}

function getOrdinalForEvalMessage(message: string) {
  const normalized = message.toLowerCase();

  if (/\b(second|2nd)\b/i.test(normalized) || /(השני|השנייה)/.test(message)) {
    return 2;
  }
  if (/\b(third|3rd)\b/i.test(normalized) || /(השלישי|השלישית)/.test(message)) {
    return 3;
  }
  if (/\b(first|1st)\b/i.test(normalized) || /(הראשון|הראשונה)/.test(message)) {
    return 1;
  }

  return null;
}

function createDefaultFakeTools(
  counterpartyEmail = "alex@example.com",
  scenario?: AiEvalScenario
): AssistantToolExecutors {
  const maskedLabel = "a***@example.com";
  const userLabel = "alex@example.com";

  return {
    async getUserAccounts() {
      return fakeResult({
        toolName: "getUserAccounts",
        summary: "Virly account",
        metadata: { recordCount: 1, accountLabel: "Virly account" }
      });
    },
    async getAccountBalance() {
      return fakeResult({
        toolName: "getAccountBalance",
        summary: "Your Virly account available balance is 125.00.",
        metadata: { recordCount: 1, accountLabel: "Virly account", amount: 125 }
      });
    },
    async getRecentTransactions() {
      return fakeResult({
        toolName: "getRecentTransactions",
        summary: "Recent transactions: sent 10.00 with a***@example.com.",
        userSummary: "Recent transactions: sent 10.00 with alex@example.com.",
        metadata: { recordCount: 1 }
      });
    },
    async getLastSentCounterparty() {
      return fakeResult({
        toolName: "getLastSentCounterparty",
        summary: `The last person you sent money to was ${maskedLabel}.`,
        userSummary: `The last person you sent money to was ${userLabel}.`,
        data: {
          email: counterpartyEmail,
          maskedLabel,
          userLabel
        },
        metadata: {
          recordCount: 1,
          counterpartyEmail,
          maskedLabel
        }
      });
    },
    async getTransactionsWithCounterparty(context: ToolContext) {
      return fakeResult({
        toolName: "getTransactionsWithCounterparty",
        summary: `Recent transactions with ${context.resolvedCounterparty?.maskedLabel ?? maskedLabel}: sent 10.00.`,
        userSummary: `Recent transactions with ${context.resolvedCounterparty?.userLabel ?? userLabel}: sent 10.00.`,
        metadata: { recordCount: 1 }
      });
    },
    async getTotalSentToCounterparty(context: ToolContext) {
      return fakeResult({
        toolName: "getTotalSentToCounterparty",
        summary: `You have sent 42.00 in total to ${context.resolvedCounterparty?.maskedLabel ?? maskedLabel}.`,
        userSummary: `You have sent 42.00 in total to ${context.resolvedCounterparty?.userLabel ?? userLabel}.`,
        metadata: { recordCount: 2, amount: 42 },
        memoryUpdates: {
          totals: [
            {
              id: `sent:${context.resolvedCounterparty?.email?.toLowerCase() ?? counterpartyEmail}`,
              counterpartyEmail:
                context.resolvedCounterparty?.email?.toLowerCase() ?? counterpartyEmail,
              direction: "sent",
              amount: 42,
              currency: "ILS",
              sourceToolName: "getTotalSentToCounterparty",
              aliases: ["that amount", "that total"]
            }
          ]
        }
      });
    },
    async getTotalReceivedFromCounterparty(context: ToolContext) {
      return fakeResult({
        toolName: "getTotalReceivedFromCounterparty",
        summary: `${context.resolvedCounterparty?.maskedLabel ?? maskedLabel} has sent you 35.00 in total.`,
        userSummary: `${context.resolvedCounterparty?.userLabel ?? userLabel} has sent you 35.00 in total.`,
        metadata: { recordCount: 2, amount: 35 },
        memoryUpdates: {
          totals: [
            {
              id: `received:${context.resolvedCounterparty?.email?.toLowerCase() ?? counterpartyEmail}`,
              counterpartyEmail:
                context.resolvedCounterparty?.email?.toLowerCase() ?? counterpartyEmail,
              direction: "received",
              amount: 35,
              currency: "ILS",
              sourceToolName: "getTotalReceivedFromCounterparty",
              aliases: ["that amount", "that total"]
            }
          ]
        }
      });
    },
    async getNetWithCounterparty(context: ToolContext) {
      return fakeResult({
        toolName: "getNetWithCounterparty",
        summary: `Your net with ${context.resolvedCounterparty?.maskedLabel ?? maskedLabel} is 15.00 ILS in your favor.`,
        userSummary: `Your net with ${context.resolvedCounterparty?.userLabel ?? userLabel} is 15.00 ILS in your favor.`,
        metadata: { recordCount: 2, amount: 15 },
        memoryUpdates: {
          totals: [
            {
              id: `net:${context.resolvedCounterparty?.email?.toLowerCase() ?? counterpartyEmail}`,
              counterpartyEmail:
                context.resolvedCounterparty?.email?.toLowerCase() ?? counterpartyEmail,
              direction: "net",
              amount: 15,
              currency: "ILS",
              sourceToolName: "getNetWithCounterparty",
              aliases: ["that amount", "that total"]
            }
          ]
        }
      });
    },
    async getVerifiedRecipients() {
      return fakeResult({
        toolName: "getVerifiedRecipients",
        summary: "Verified recipients: Alex Example (a***@example.com).",
        userSummary: "Verified recipients: Alex Example (alex@example.com).",
        metadata: { recordCount: 1 }
      });
    },
    async getTransferLimits() {
      return fakeResult({
        toolName: "getTransferLimits",
        summary: "Current development transfer limits are 500.00 per transfer.",
        metadata: { recordCount: 1 }
      });
    },
    async getTransferQuote() {
      return fakeResult({
        toolName: "getTransferQuote",
        summary:
          "Transfer quote: this transfer can be prepared in ILS with no fee.",
        metadata: { recordCount: 1 }
      });
    },
    async getTransferEligibility() {
      return fakeResult({
        toolName: "getTransferEligibility",
        summary: "You can send that amount right now.",
        metadata: { recordCount: 1 }
      });
    },
    async getDailyTransferUsage() {
      return fakeResult({
        toolName: "getDailyTransferUsage",
        summary:
          "Daily transfer usage: used 120.00 ILS of 1000.00 ILS today, with 880.00 ILS remaining.",
        metadata: { recordCount: 2, amount: 880 }
      });
    },
    async getPendingAiTransfers() {
      const rows = pendingTransferRowsForScenario(scenario);

      return fakeResult({
        toolName: "getPendingAiTransfers",
        data: rows,
        memoryUpdates: {
          pendingTransfers: rows.map((row) => ({
            pendingTransferId: row.pendingTransferId,
            label: row.label,
            recipientLabel: row.recipientLabel,
            amount: row.amount,
            currency: row.currency,
            expiresAt: row.expiresAt
          }))
        },
        summary: `Pending transfer confirmations in this conversation: ${rows
          .map((row) => row.llmLabel)
          .join("; ")}.`,
        userSummary: `Pending transfer confirmations in this conversation: ${rows
          .map((row) => row.label)
          .join("; ")}.`,
        metadata: {
          recordCount: rows.length,
          pendingTransfers: rows.map((row) => ({
            pendingTransferId: row.pendingTransferId,
            label: row.llmLabel,
            recipientLabel: row.recipientMaskedLabel,
            amount: row.amount,
            currency: row.currency,
            status: row.status,
            expiresAt: row.expiresAt
          }))
        }
      });
    },
    async resolvePendingTransferReference(context: ToolContext) {
      const rows = pendingTransferRowsForScenario(scenario);
      const ordinal = getOrdinalForEvalMessage(context.message);
      const resolvedRows = ordinal ? rows.slice(ordinal - 1, ordinal) : rows;
      const status = resolvedRows.length === 1 ? "resolved" : "ambiguous";

      return fakeResult({
        toolName: "resolvePendingTransferReference",
        data: {
          kind: "pending_transfer",
          status,
          pendingTransferId:
            status === "resolved" ? resolvedRows[0]?.pendingTransferId : undefined,
          candidates: resolvedRows.map((row) => ({
            id: row.pendingTransferId,
            label: row.label,
            value: row.pendingTransferId
          }))
        },
        summary:
          status === "resolved"
            ? `Resolved pending transfer reference to ${resolvedRows[0]?.llmLabel}.`
            : `I found multiple pending transfer confirmations: ${rows.map((row) => row.llmLabel).join("; ")}.`,
        userSummary:
          status === "resolved"
            ? `Resolved pending transfer reference to ${resolvedRows[0]?.label}.`
            : `I found multiple pending transfer confirmations: ${rows.map((row) => row.label).join("; ")}.`,
        metadata: {
          recordCount: resolvedRows.length,
          pendingTransferResolutionStatus: status,
          pendingTransferCandidates: resolvedRows.map((row) => ({
            pendingTransferId: row.pendingTransferId,
            label: row.llmLabel,
            recipientLabel: row.recipientMaskedLabel,
            amount: row.amount,
            currency: row.currency,
            expiresAt: row.expiresAt
          }))
        }
      });
    }
  };
}

function createPhaseTwoCounterpartyTools(
  scenario: AiEvalScenario
): AssistantToolExecutors {
  const baseTools = createDefaultFakeTools("alex@example.com", scenario);
  const resolver = scenario.setup?.counterpartyResolver;

  return {
    ...baseTools,
    async getRecentSentCounterparties() {
      return fakeResult({
        toolName: "getRecentSentCounterparties",
        summary:
          "Recent people you sent money to: Daniel Example (d***@example.com) (70.00 ILS last sent); Maya Example (m***@example.com) (42.00 ILS last sent).",
        userSummary:
          "Recent people you sent money to: Daniel Example (daniel@example.com) (70.00 ILS last sent); Maya Example (maya@example.com) (42.00 ILS last sent).",
        metadata: {
          recordCount: 2,
          counterparties: [
            {
              counterpartyEmail: "daniel@example.com",
              maskedLabel: "d***@example.com",
              displayName: "Daniel Example"
            },
            {
              counterpartyEmail: "maya@example.com",
              maskedLabel: "m***@example.com",
              displayName: "Maya Example"
            }
          ]
        },
        memoryUpdates: {
          counterparties: [
            {
              counterpartyId: "daniel@example.com",
              emailFullForBackendOnly: "daniel@example.com",
              emailMasked: "d***@example.com",
              displayName: "Daniel Example",
              firstName: "Daniel",
              lastName: "Example",
              relation: "sent_to",
              source: "transaction",
              lastInteractionAt: "2026-05-24T10:00:00.000Z"
            },
            {
              counterpartyId: "maya@example.com",
              emailFullForBackendOnly: "maya@example.com",
              emailMasked: "m***@example.com",
              displayName: "Maya Example",
              firstName: "Maya",
              lastName: "Example",
              relation: "sent_to",
              source: "transaction",
              lastInteractionAt: "2026-05-24T11:00:00.000Z"
            }
          ]
        }
      });
    },
    async getRecentReceivedCounterparties() {
      return fakeResult({
        toolName: "getRecentReceivedCounterparties",
        summary:
          "Recent people who sent you money: Sarah Example (s***@example.com).",
        userSummary:
          "Recent people who sent you money: Sarah Example (sarah@example.com).",
        metadata: {
          recordCount: 1,
          counterparties: [
            {
              counterpartyEmail: "sarah@example.com",
              maskedLabel: "s***@example.com",
              displayName: "Sarah Example"
            }
          ]
        },
        memoryUpdates: {
          counterparties: [
            {
              counterpartyId: "sarah@example.com",
              emailFullForBackendOnly: "sarah@example.com",
              emailMasked: "s***@example.com",
              displayName: "Sarah Example",
              firstName: "Sarah",
              lastName: "Example",
              relation: "received_from",
              source: "transaction",
              lastInteractionAt: "2026-05-24T12:00:00.000Z"
            }
          ]
        }
      });
    },
    async resolveCounterpartyCandidates() {
      if (resolver?.status === "resolved") {
        const displayName = resolver.displayName ?? resolver.email;
        const masked = `${resolver.email.slice(0, 1)}***@example.com`;
        return fakeResult({
          toolName: "resolveCounterpartyCandidates",
          data: {
            kind: "counterparty",
            status: "resolved",
            counterparty: {
              email: resolver.email,
              maskedLabel: masked,
              userLabel: `${displayName} (${resolver.email})`,
              displayName
            },
            candidates: [
              {
                id: resolver.email,
                label: `${displayName} (${resolver.email})`,
                value: resolver.email
              }
            ]
          },
          summary: `Resolved counterparty: ${displayName} (${masked}).`,
          userSummary: `Resolved counterparty: ${displayName} (${resolver.email}).`,
          metadata: { recordCount: 1, resolutionStatus: "resolved" }
        });
      }

      if (resolver?.status === "ambiguous") {
        return fakeResult({
          toolName: "resolveCounterpartyCandidates",
          data: {
            kind: "counterparty",
            status: "ambiguous",
            candidates: resolver.candidates.map((candidate) => ({
              id: candidate.email,
              label: `${candidate.displayName} (${candidate.email})`,
              value: candidate.email
            }))
          },
          summary: "Multiple possible counterparties matched that reference.",
          userSummary: resolver.candidates
            .map((candidate) => `${candidate.displayName} (${candidate.email})`)
            .join("; "),
          metadata: { recordCount: resolver.candidates.length, resolutionStatus: "ambiguous" }
        });
      }

      return fakeResult({
        toolName: "resolveCounterpartyCandidates",
        data: {
          kind: "counterparty",
          status: "resolved",
          counterparty: {
            email: "daniel@example.com",
            maskedLabel: "d***@example.com",
            userLabel: "Daniel Example (daniel@example.com)",
            displayName: "Daniel Example"
          },
          candidates: [
            {
              id: "daniel@example.com",
              label: "Daniel Example (daniel@example.com)",
              value: "daniel@example.com"
            }
          ]
        },
        summary: "Resolved counterparty: Daniel Example (d***@example.com).",
        userSummary: "Resolved counterparty: Daniel Example (daniel@example.com).",
        metadata: { recordCount: 1, resolutionStatus: "resolved" }
      });
    },
    async getCounterpartySummary() {
      return fakeResult({
        toolName: "getCounterpartySummary",
        summary:
          "History with Daniel Example (d***@example.com): sent 70.00 ILS, received 20.00 ILS, net -50.00 ILS.",
        userSummary:
          "History with Daniel Example (daniel@example.com): sent 70.00 ILS, received 20.00 ILS, net -50.00 ILS.",
        metadata: { recordCount: 3, amount: -50 }
      });
    },
    async getCounterpartyActivityTimeline() {
      return fakeResult({
        toolName: "getCounterpartyActivityTimeline",
        summary:
          "Recent activity with Daniel Example (d***@example.com): sent 50.00 ILS; received 20.00 ILS.",
        userSummary:
          "Recent activity with Daniel Example (daniel@example.com): sent 50.00 ILS; received 20.00 ILS.",
        metadata: { recordCount: 2 }
      });
    }
  };
}

function createPhaseThreeTransactionTools(
  scenario: AiEvalScenario
): AssistantToolExecutors {
  const baseTools = createPhaseTwoCounterpartyTools(scenario);

  return {
    ...baseTools,
    async searchTransactions() {
      return fakeResult({
        toolName: "searchTransactions",
        memoryUpdates: {
          transactions: [
            {
              transactionId: "tx-1",
              label: "1. sent 120.00 ILS with Daniel Example (daniel@example.com)",
              amount: 120,
              currency: "ILS",
              direction: "sent",
              occurredAt: "2026-05-18T10:00:00.000Z",
              counterpartyLabel: "Daniel Example (daniel@example.com)"
            },
            {
              transactionId: "tx-2",
              label: "2. received 200.00 ILS with Sarah Example (sarah@example.com)",
              amount: 200,
              currency: "ILS",
              direction: "received",
              occurredAt: "2026-05-19T10:00:00.000Z",
              counterpartyLabel: "Sarah Example (sarah@example.com)"
            }
          ]
        },
        summary:
          "Transactions matching sent, over 100.00 ILS, last week: 1. sent 120.00 ILS with Daniel Example (d***@example.com); 2. received 200.00 ILS with Sarah Example (s***@example.com).",
        userSummary:
          "Transactions matching sent, over 100.00 ILS, last week: 1. sent 120.00 ILS with Daniel Example (daniel@example.com); 2. received 200.00 ILS with Sarah Example (sarah@example.com).",
        metadata: {
          recordCount: 2,
          transactions: [
            {
              transactionId: "tx-1",
              label: "1. sent 120.00 ILS with Daniel Example (d***@example.com)",
              amount: 120,
              currency: "ILS",
              direction: "sent",
              occurredAt: "2026-05-18T10:00:00.000Z",
              counterpartyLabel: "Daniel Example (d***@example.com)"
            },
            {
              transactionId: "tx-2",
              label: "2. received 200.00 ILS with Sarah Example (s***@example.com)",
              amount: 200,
              currency: "ILS",
              direction: "received",
              occurredAt: "2026-05-19T10:00:00.000Z",
              counterpartyLabel: "Sarah Example (s***@example.com)"
            }
          ]
        }
      });
    },
    async getTransactionStats() {
      return fakeResult({
        toolName: "getTransactionStats",
        data: {
          count: 4,
          sentTotal: 150,
          receivedTotal: 300,
          net: 150
        },
        summary:
          "Transaction stats for this month: 4 total, sent 150.00 ILS across 2, received 300.00 ILS across 2, net 150.00 ILS.",
        metadata: {
          recordCount: 4,
          amount: 150
        }
      });
    },
    async resolveTransactionReference(context: ToolContext) {
      if (/ambiguous|which/i.test(context.message)) {
        return fakeResult({
          toolName: "resolveTransactionReference",
          data: {
            kind: "transaction",
            status: "ambiguous",
            candidates: [
              {
                id: "tx-1",
                label: "1. sent 120.00 ILS with Daniel Example (daniel@example.com)",
                value: "tx-1"
              },
              {
                id: "tx-2",
                label: "2. received 200.00 ILS with Sarah Example (sarah@example.com)",
                value: "tx-2"
              }
            ]
          },
          summary: "Multiple recent transactions matched that reference.",
          metadata: {
            recordCount: 2,
            transactionResolutionStatus: "ambiguous",
            transactionCandidates: [
              {
                transactionId: "tx-1",
                label: "1. sent 120.00 ILS with Daniel Example (d***@example.com)",
                amount: 120,
                currency: "ILS",
                direction: "sent",
                occurredAt: "2026-05-18T10:00:00.000Z"
              },
              {
                transactionId: "tx-2",
                label: "2. received 200.00 ILS with Sarah Example (s***@example.com)",
                amount: 200,
                currency: "ILS",
                direction: "received",
                occurredAt: "2026-05-19T10:00:00.000Z"
              }
            ]
          }
        });
      }

      const transactionId = /second|2nd|שני|שנייה/.test(context.message)
        ? "tx-2"
        : "tx-1";
      return fakeResult({
        toolName: "resolveTransactionReference",
        data: {
          kind: "transaction",
          status: "resolved",
          transactionId,
          candidates: [
            {
              id: transactionId,
              label:
                transactionId === "tx-2"
                  ? "2. received 200.00 ILS with Sarah Example (sarah@example.com)"
                  : "1. sent 120.00 ILS with Daniel Example (daniel@example.com)",
              value: transactionId
            }
          ]
        },
        summary: `Resolved transaction reference to ${transactionId}.`,
        metadata: {
          recordCount: 1,
          transactionId,
          transactionResolutionStatus: "resolved",
          transactionCandidates: [
            {
              transactionId,
              label:
                transactionId === "tx-2"
                  ? "2. received 200.00 ILS with Sarah Example (s***@example.com)"
                  : "1. sent 120.00 ILS with Daniel Example (d***@example.com)",
              amount: transactionId === "tx-2" ? 200 : 120,
              currency: "ILS",
              direction: transactionId === "tx-2" ? "received" : "sent",
              occurredAt: "2026-05-19T10:00:00.000Z"
            }
          ]
        }
      });
    },
    async getTransactionReceipt(context: ToolContext) {
      return fakeResult({
        toolName: "getTransactionReceipt",
        summary: `Transaction details for ${context.resolvedTransactionId}: received 200.00 ILS with Sarah Example (s***@example.com).`,
        userSummary: `Transaction details for ${context.resolvedTransactionId}: received 200.00 ILS with Sarah Example (sarah@example.com).`,
        data: {
          transactionId: context.resolvedTransactionId ?? "missing",
          label: "2. received 200.00 ILS with Sarah Example (sarah@example.com)",
          llmLabel:
            "2. received 200.00 ILS with Sarah Example (s***@example.com)",
          amount: 200,
          currency: "ILS",
          direction: "received",
          counterpartyLabel: "Sarah Example (sarah@example.com)",
          counterpartyMaskedLabel: "s***@example.com",
          counterpartyEmail: "sarah@example.com",
          reason: null,
          occurredAt: "2026-05-19T10:00:00.000Z",
          status: "completed"
        },
        metadata: {
          recordCount: 1,
          transactionId: context.resolvedTransactionId,
          transactions: [
            {
              transactionId: context.resolvedTransactionId ?? "missing",
              label:
                "2. received 200.00 ILS with Sarah Example (s***@example.com)",
              amount: 200,
              currency: "ILS",
              direction: "received",
              occurredAt: "2026-05-19T10:00:00.000Z",
              status: "completed",
              counterpartyLabel: "Sarah Example (s***@example.com)"
            }
          ]
        }
      });
    }
  };
}

function createToolsForScenario(scenario: AiEvalScenario): AssistantToolExecutors {
  const needsCounterpartyResolver =
    scenario.setup?.counterpartyResolver != null ||
    scenario.turns.some((turn) => turn.expectedToolCalls?.includes("resolveCounterpartyCandidates"));

  if (scenario.toolPreset === "phase_three_transactions") {
    return createPhaseThreeTransactionTools(scenario);
  }

  return scenario.toolPreset === "phase_two_counterparty" || needsCounterpartyResolver
    ? createPhaseTwoCounterpartyTools(scenario)
    : createDefaultFakeTools("alex@example.com", scenario);
}

function createDeterministicAmountResolutionService(): AmountResolutionService {
  return async (input) => {
    const amountReferenceText = input.transferDraft.amountReferenceText?.trim() ?? "";
    const referenceKind = classifyAmountReference(amountReferenceText);
    const scopedTotals = (input.counterpartyMemory.entities ?? [])
      .filter((entity) => {
        if (entity.type !== "total" || typeof entity.amount !== "number") {
          return false;
        }

        return input.resolvedCounterparty?.email
          ? entity.counterpartyEmail === input.resolvedCounterparty.email
          : true;
      })
      .sort((left, right) => right.turnLastReferenced - left.turnLastReferenced);
    const latestTotal = scopedTotals[0];
    const hasPositiveAnswerTotal = scopedTotals.some(
      (entity) => typeof entity.amount === "number" && entity.amount > 0
    );

    if (referenceKind === "last_answer_total") {
      return latestTotal?.amount && latestTotal.amount > 0
        ? {
            status: "resolved",
            amount: {
              amount: latestTotal.amount,
              currency: "ILS",
              source:
                latestTotal.direction === "received"
                  ? "last_answer_total_received"
                  : latestTotal.direction === "sent"
                    ? "last_answer_total_sent"
                    : "last_answer_total_net",
              confidence: "high",
              explanation:
                "Resolved amount from deterministic eval total-answer memory."
            }
          }
        : {
            status: "unresolved",
            reason: "no_answer_total_available"
          };
    }

    if (referenceKind === "last_received_transaction") {
      return input.resolvedCounterparty
        ? {
            status: "resolved",
            amount: {
              amount: 35,
              currency: "ILS",
              source: "last_received_transaction",
              confidence: "high",
              explanation:
                "Resolved amount from deterministic eval latest received transaction."
            }
          }
        : {
            status: "unresolved",
            reason: "missing_resolved_counterparty"
          };
    }

    if (referenceKind === "last_sent_transaction") {
      return input.resolvedCounterparty
        ? {
            status: "resolved",
            amount: {
              amount: 42,
              currency: "ILS",
              source: "last_sent_transaction",
              confidence: "high",
              explanation:
                "Resolved amount from deterministic eval latest sent transaction."
            }
          }
        : {
            status: "unresolved",
            reason: "missing_resolved_counterparty"
          };
    }

    if (referenceKind === "last_pending_transfer") {
      const pending = input.counterpartyMemory.pendingConfirmation;
      if (pending?.status === "pending" && pending.amount > 0) {
        return {
          status: "resolved",
          amount: {
            amount: pending.amount,
            currency: "ILS",
            source: "last_pending_transfer",
            confidence: "high",
            explanation:
              "Resolved amount from deterministic eval active pending transfer."
          }
        };
      }

      if (hasPositiveAnswerTotal) {
        return {
          status: "unresolved",
          reason: "ambiguous_amount_scope"
        };
      }

      return input.resolvedCounterparty
        ? {
            status: "resolved",
            amount: {
              amount: 42,
              currency: "ILS",
              source: "last_sent_transaction",
              confidence: "high",
              explanation:
                "Resolved amount from deterministic eval latest sent transaction."
            }
          }
        : {
            status: "unresolved",
            reason: "missing_resolved_counterparty"
          };
    }

    return {
      status: "unresolved",
      reason: "unsupported_amount_reference"
    };
  };
}

function createLlmProviderForMode(
  scenario: AiEvalScenario,
  mode: AiEvalMode,
  createConfiguredProvider: (() => AssistantLlmProvider | undefined) | undefined
): AssistantLlmProvider | undefined {
  if (mode === "llm-dev") {
    return createConfiguredLlmProviderForEval(createConfiguredProvider);
  }

  const needsModificationClassifier = scenario.turns.some(
    (turn) =>
      turn.expectedIntent === "transfer_modify_pending" &&
      /\b(actually make it|make it|change it to)\b/i.test(turn.userMessage)
  );

  if (!needsModificationClassifier) {
    return undefined;
  }

  return {
    async classifyIntent(input) {
      const deterministic = classifyAssistantIntentDeterministic(
        input.userMessage,
        { counterpartyMemory: input.counterpartyMemory }
      );
      if (deterministic.intent !== "unsupported") {
        return deterministic;
      }

      if (
        input.counterpartyMemory.pendingConfirmation?.status === "pending" &&
        /\b(actually make it|make it|change it to)\b/i.test(input.userMessage)
      ) {
        return { intent: "transfer_modify_pending" };
      }

      return deterministic;
    },
    async extractTransferDraft(input) {
      if (/Sarah/i.test(input.userMessage)) {
        return { recipientReference: "Sarah" };
      }

      if (/make it 70/i.test(input.userMessage)) {
        return {
          amount: 70,
          currency: "ILS",
          currencyMentioned: false,
          currencySupported: true
        };
      }

      return {};
    },
    async resolveCounterpartyReference() {
      return { kind: "none", confidence: "low" };
    },
    async composeResponse(input) {
      return input.fallbackMessage;
    }
  };
}

function collectFailures(
  fixtureFile: AiEvalFixtureFile,
  scenario: AiEvalScenario,
  turn: AiEvalTurnExpectation,
  result: Awaited<ReturnType<typeof runAssistantGraph>>,
  turnIndex: number,
  mode: AiEvalMode
) {
  const failures: string[] = [];
  const prefix = `${fixtureFile.suiteName}/${scenario.id} turn ${turnIndex}`;
  const isLiveLlmMode = mode === "llm-dev" || mode === "llm-seeded-mongo";
  const containsHebrew = /[\u0590-\u05ff]/.test(result.message);

  if (
    isLiveLlmMode &&
    turn.expectedResponseLanguage === "hebrew" &&
    !containsHebrew
  ) {
    failures.push(`${prefix} response expected Hebrew text`);
  }

  if (turn.expectedIntent && result.intent !== turn.expectedIntent) {
    failures.push(
      `${prefix} intent expected ${turn.expectedIntent} but got ${result.intent}`
    );
  }

  if (
    turn.expectedToolCalls &&
    JSON.stringify(result.toolCalls) !== JSON.stringify(turn.expectedToolCalls)
  ) {
    failures.push(
      `${prefix} tool calls expected ${JSON.stringify(turn.expectedToolCalls)} but got ${JSON.stringify(result.toolCalls)}`
    );
  }

  for (const expectedToolName of turn.expectedToolCallsInclude ?? []) {
    if (!result.toolCalls.includes(expectedToolName)) {
      failures.push(`${prefix} tool calls must include ${expectedToolName}`);
    }
  }

  if (
    turn.expectedConfirmation?.recipientEmail &&
    result.confirmation?.recipientEmail !== turn.expectedConfirmation.recipientEmail
  ) {
    failures.push(
      `${prefix} confirmation recipient expected ${turn.expectedConfirmation.recipientEmail} but got ${result.confirmation?.recipientEmail ?? "undefined"}`
    );
  }

  if (
    typeof turn.expectedConfirmation?.amount === "number" &&
    result.confirmation?.amount !== turn.expectedConfirmation.amount
  ) {
    failures.push(
      `${prefix} confirmation amount expected ${turn.expectedConfirmation.amount} but got ${result.confirmation?.amount ?? "undefined"}`
    );
  }

  if (
    typeof turn.mustAskClarification === "boolean" &&
    Boolean(result.clarification) !== turn.mustAskClarification
  ) {
    failures.push(
      `${prefix} clarification presence expected ${turn.mustAskClarification} but got ${Boolean(result.clarification)}`
    );
  }

  if (turn.mustNotCreateConfirmation && result.confirmation) {
    failures.push(`${prefix} expected no transfer confirmation`);
  }

  for (const expectedText of turn.mustInclude ?? []) {
    if (!new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(result.message)) {
      failures.push(`${prefix} message must include ${expectedText}`);
    }
  }

  for (const forbiddenText of turn.mustNotInclude ?? []) {
    if (new RegExp(forbiddenText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(result.message)) {
      failures.push(`${prefix} message must not include ${forbiddenText}`);
    }
  }

  return failures;
}

export async function runAiEvalFixtures(options: {
  mode: AiEvalMode;
  fixtures?: AiEvalFixtureFile[];
  createConfiguredProvider?: () => AssistantLlmProvider | undefined;
}): Promise<AiEvalRunSummary> {
  if (options.mode === "seeded-mongo") {
    return runSeededMongoEvalFixtures();
  }

  if (options.mode === "llm-seeded-mongo") {
    return runSeededMongoEvalFixtures({
      mode: "llm-seeded-mongo",
      llmProvider: createConfiguredLlmProviderForEval(
        options.createConfiguredProvider
      )
    });
  }

  const fixtures = options.fixtures ?? loadAiEvalFixtureFiles();
  const failedTurns: AiEvalTurnResult[] = [];
  let totalScenarios = 0;
  let totalTurns = 0;

  for (const fixtureFile of fixtures) {
    for (const scenario of fixtureFile.scenarios) {
      totalScenarios += 1;
      const conversationStore = createInMemoryConversationStore(scenario);
      const tools = createToolsForScenario(scenario);
      const llmProvider = createLlmProviderForMode(
        scenario,
        options.mode,
        options.createConfiguredProvider
      );
      const amountResolutionService = createDeterministicAmountResolutionService();
      const transferPreparationService = createTransferPreparationService();
      const transferModificationService = createTransferModificationService();

      for (const [turnIndex, turn] of scenario.turns.entries()) {
        totalTurns += 1;
        const result = await runAssistantGraph(
          {
            userId: "507f1f77bcf86cd799439011",
            conversationId: `eval-${scenario.id}`,
            message: turn.userMessage
          },
          {
            tools,
            conversationStore,
            llmProvider,
            amountResolutionService,
            transferPreparationService,
            transferModificationService
          }
        );

        const failures = collectFailures(
          fixtureFile,
          scenario,
          turn,
          result,
          turnIndex,
          options.mode
        );

        if (failures.length > 0) {
          failedTurns.push({
            fixtureSuiteName: fixtureFile.suiteName,
            scenarioId: scenario.id,
            turnIndex,
            userMessage: turn.userMessage,
            passed: false,
            failures
          });
        }
      }
    }
  }

  return {
    mode: options.mode,
    totalFixtures: fixtures.length,
    totalScenarios,
    totalTurns,
    failedTurns
  };
}
