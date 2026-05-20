import {
  AssistantIntent,
  AssistantLlmProvider,
  AssistantToolName,
  IntentClassification
} from "./state.js";
import { getUnsafeRequestReason } from "./policy.js";

const validIntents: AssistantIntent[] = [
  "balance_inquiry",
  "recent_transactions",
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
  llmProvider?: AssistantLlmProvider
): Promise<IntentClassification> {
  const refusalReason = getUnsafeRequestReason(message);
  if (refusalReason) {
    return { intent: "unsafe_request", refusalReason };
  }

  if (!llmProvider) {
    return classifyAssistantIntentDeterministic(message);
  }

  try {
    return normalizeClassification(await llmProvider.classifyIntent(message));
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
    "getVerifiedRecipients",
    "getTransferLimits"
  ].includes(toolName);
}
