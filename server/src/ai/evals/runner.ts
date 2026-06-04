import { runAssistantGraph } from "../graph.js";
import { createConfiguredAssistantLlmProvider } from "../llm.js";
import type {
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

export type AiEvalMode = "deterministic" | "llm-dev" | "seeded-mongo";

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

function createDefaultFakeTools(
  counterpartyEmail = "alex@example.com"
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
      return fakeResult({
        toolName: "getPendingAiTransfers",
        summary:
          "Pending transfer confirmations in this conversation: 1. 50.00 ILS to Alex Example (a***@example.com).",
        userSummary:
          "Pending transfer confirmations in this conversation: 1. 50.00 ILS to Alex Example (alex@example.com).",
        metadata: { recordCount: 1 }
      });
    }
  };
}

function createPhaseTwoCounterpartyTools(
  scenario: AiEvalScenario
): AssistantToolExecutors {
  const baseTools = createDefaultFakeTools();
  const resolver = scenario.setup?.counterpartyResolver;

  return {
    ...baseTools,
    async getRecentSentCounterparties() {
      return fakeResult({
        toolName: "getRecentSentCounterparties",
        summary:
          "Recent people you sent money to: Daniel Example (d***@example.com); Maya Example (m***@example.com).",
        userSummary:
          "Recent people you sent money to: Daniel Example (daniel@example.com); Maya Example (maya@example.com).",
        metadata: { recordCount: 2 }
      });
    },
    async getRecentReceivedCounterparties() {
      return fakeResult({
        toolName: "getRecentReceivedCounterparties",
        summary:
          "Recent people who sent you money: Sarah Example (s***@example.com).",
        userSummary:
          "Recent people who sent you money: Sarah Example (sarah@example.com).",
        metadata: { recordCount: 1 }
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
    : createDefaultFakeTools();
}

function createLlmProviderForMode(
  scenario: AiEvalScenario,
  mode: AiEvalMode,
  createConfiguredProvider: (() => AssistantLlmProvider | undefined) | undefined
): AssistantLlmProvider | undefined {
  if (mode === "llm-dev") {
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

  const needsModificationClassifier = scenario.turns.some(
    (turn) => turn.expectedIntent === "transfer_modify_pending"
  );

  if (!needsModificationClassifier) {
    return undefined;
  }

  return {
    async classifyIntent(input) {
      if (input.userMessage === "yes") {
        return { intent: "pending_confirmation_status" };
      }

      return { intent: "transfer_modify_pending" };
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
  turnIndex: number
) {
  const failures: string[] = [];
  const prefix = `${fixtureFile.suiteName}/${scenario.id} turn ${turnIndex}`;

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
            transferPreparationService,
            transferModificationService
          }
        );

        const failures = collectFailures(
          fixtureFile,
          scenario,
          turn,
          result,
          turnIndex
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
