import {
  AssistantIntent,
  AssistantLlmProvider,
  AssistantToolName,
  ClassifyAssistantIntentInput,
  IntentClassification
} from "./state.js";
import { getUnsafeRequestReason } from "./policy.js";

const validIntents: AssistantIntent[] = [
  "balance_inquiry",
  "recent_transactions",
  "last_sent_counterparty",
  "counterparty_transactions",
  "counterparty_total_sent",
  "transfer_prepare",
  "verified_recipients",
  "transfer_limits",
  "transfer_status",
  "general_help",
  "unsafe_request",
  "unsupported"
];

export function classifyAssistantIntentDeterministic(
  message: string
): IntentClassification {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  const normalized = message.toLowerCase();

  if (
    /\b(last|most recent)\b.*\b(person|recipient|counterparty|who)\b.*\b(sent|paid|transferred)\b/i.test(normalized) ||
    /\b(who|person|recipient|counterparty)\b.*\b(last|most recent)\b.*\b(sent|paid|transferred)\b/i.test(normalized)
  ) {
    return { intent: "last_sent_counterparty" };
  }

  if (
    /\b(total|ever|altogether|in total|sum)\b.*\b(send|sent|paid|transferred)\b.*\b(this|that|person|recipient|counterparty|them)\b/i.test(normalized) ||
    /\bhow much\b.*\b(send|sent|paid|transferred)\b.*\b(this|that|person|recipient|counterparty|them)\b/i.test(normalized)
  ) {
    return { intent: "counterparty_total_sent" };
  }

  if (
    /\b(transaction|transactions|activity|history|recent|last\s+\d+)\b.*\b(with|to|from)\b.*\b(this|that|person|recipient|counterparty|them)\b/i.test(normalized)
  ) {
    return { intent: "counterparty_transactions" };
  }

  if (
    /\b(send|transfer|pay|move|wire|return|give)\b.*\b(\$|usd|dollar|dollars|nis|shekel|shekels|money|[0-9])/i.test(normalized) ||
    /\b(send|transfer|pay|move|wire|return|give)\b.*\b(to|for)\b/i.test(normalized)
  ) {
    return { intent: "transfer_prepare" };
  }

  if (/\b(balance|available funds|how much.*have)\b/i.test(normalized)) {
    return { intent: "balance_inquiry" };
  }

  if (/\b(transaction|transactions|activity|history|recent|spent|received)\b/i.test(normalized)) {
    return { intent: "recent_transactions" };
  }

  if (/\b(recipient|recipients|people|contacts|verified)\b/i.test(normalized)) {
    return { intent: "verified_recipients" };
  }

  if (/\b(limit|limits|maximum|max|how much can)\b/i.test(normalized)) {
    return { intent: "transfer_limits" };
  }

  if (/\b(status|pending|completed|failed)\b/i.test(normalized)) {
    return { intent: "transfer_status" };
  }

  if (/\b(help|how do i|what can you do|support)\b/i.test(normalized)) {
    return { intent: "general_help" };
  }

  return { intent: "unsupported" };
}

function normalizeClassification(
  classification: IntentClassification
): IntentClassification {
  if (!validIntents.includes(classification.intent)) {
    return { intent: "unsupported" };
  }

  if (classification.intent === "unsafe_request" && !classification.refusalReason) {
    return {
      intent: "unsafe_request",
      refusalReason: "write_action_not_supported"
    };
  }

  return classification;
}

export async function classifyAssistantIntent(
  message: string,
  llmProvider?: AssistantLlmProvider,
  context?: Pick<ClassifyAssistantIntentInput, "messages" | "counterpartyMemory">
): Promise<IntentClassification> {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  if (!llmProvider) {
    return classifyAssistantIntentDeterministic(message);
  }

  try {
    return normalizeClassification(
      await llmProvider.classifyIntent({
        userMessage: message,
        messages: context?.messages ?? [{ role: "user", content: message }],
        counterpartyMemory:
          context?.counterpartyMemory ?? {
            turn: 0,
            mentionedCounterparties: []
          }
      })
    );
  } catch (error) {
    console.warn(
      "AI intent classifier failed; using deterministic fallback.",
      error instanceof Error ? error.message : error
    );
    return classifyAssistantIntentDeterministic(message);
  }
}

export function getReadOnlyToolsForIntent(
  intent: AssistantIntent
): AssistantToolName[] {
  switch (intent) {
    case "balance_inquiry":
      return ["getUserAccounts", "getAccountBalance"];
    case "recent_transactions":
      return ["getRecentTransactions"];
    case "last_sent_counterparty":
      return ["getLastSentCounterparty"];
    case "counterparty_transactions":
      return ["getTransactionsWithCounterparty"];
    case "counterparty_total_sent":
      return ["getTotalSentToCounterparty"];
    case "verified_recipients":
      return ["getVerifiedRecipients"];
    case "transfer_limits":
      return ["getTransferLimits"];
    default:
      return [];
  }
}

export function isReadOnlyToolName(toolName: string): toolName is AssistantToolName {
  return [
    "getUserAccounts",
    "getAccountBalance",
    "getRecentTransactions",
    "getLastSentCounterparty",
    "getTransactionsWithCounterparty",
    "getTotalSentToCounterparty",
    "getVerifiedRecipients",
    "getTransferLimits"
  ].includes(toolName);
}
