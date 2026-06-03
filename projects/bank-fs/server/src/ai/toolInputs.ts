import { resolveCommonDateRange } from "./dateResolution.js";
import type { AssistantGraphState, AssistantToolName, ToolContext } from "./state.js";

export function buildToolInput(
  toolName: AssistantToolName,
  state: AssistantGraphState
): ToolContext {
  const dateRange = resolveCommonDateRange(
    state.normalizedMessage?.normalizedText ?? "",
    "Asia/Jerusalem"
  );

  switch (toolName) {
    case "getUserAccounts":
    case "getAccountBalance":
    case "getTransferLimits":
    case "getDailyTransferUsage":
      return {
        userId: state.userId!,
        conversationId: state.conversationId,
        message: state.normalizedMessage?.normalizedText ?? "",
        currentTurn: state.currentTurn
      };

    case "resolveCounterpartyCandidates":
    case "resolveTransactionReference":
    case "resolvePendingTransferReference":
    case "getPendingAiTransfers":
    case "getVerifiedRecipients":
    case "getRecentTransactions":
    case "getLastSentCounterparty":
    case "getRecentSentCounterparties":
    case "getRecentReceivedCounterparties":
    case "searchTransactions":
    case "getTransactionStats":
    case "getTransferEligibility":
    case "getTransferQuote":
    case "getTransactionsWithCounterparty":
    case "getTotalSentToCounterparty":
    case "getTotalReceivedFromCounterparty":
    case "getNetWithCounterparty":
    case "getCounterpartySummary":
    case "getCounterpartyActivityTimeline":
    case "getTransactionReceipt":
      return {
        userId: state.userId!,
        conversationId: state.conversationId,
        message: state.normalizedMessage?.normalizedText ?? "",
        resolvedCounterparty: state.resolvedCounterparty,
        resolvedTransactionId: state.toolResults
          .map((result) => result.data)
          .find(
            (data): data is { transactionId: string } =>
              Boolean(
                data &&
                  typeof data === "object" &&
                  "transactionId" in data &&
                  typeof (data as { transactionId?: unknown }).transactionId ===
                    "string"
              )
          )?.transactionId,
        counterpartyMemory: state.counterpartyMemory,
        clarification: state.counterpartyMemory.clarification ?? null,
        requestSlots: state.requestSlots,
        currentTurn: state.currentTurn,
        resolvedDateRange: dateRange
          ? {
              from: new Date(dateRange.resolvedFrom),
              to: new Date(dateRange.resolvedTo),
              label: dateRange.label
            }
          : undefined
      };

    default:
      return {
        userId: state.userId!,
        conversationId: state.conversationId,
        message: state.normalizedMessage?.normalizedText ?? "",
        currentTurn: state.currentTurn
      };
  }
}
